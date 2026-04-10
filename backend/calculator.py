import warnings
warnings.filterwarnings("ignore", category=Warning, module="urllib3")

import yfinance as yf
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from datetime import datetime, timedelta
from typing import Tuple, List, Dict


def _fetch_returns_and_metadata(
    tickers: List[str],
    lookback_days: int,
    start_date: str,
    end_date: str,
) -> Tuple[pd.DataFrame, Dict[str, Dict], List[Dict]]:
    """
    Batch-download prices, compute aligned log returns, and fetch metadata.

    Returns:
      - log_returns: DataFrame (lookback_days x N) of aligned log returns
      - metadata: dict of ticker -> {name, currency, last_px}
      - failed: list of {"ticker": ..., "reason": ...}
    """
    failed = []

    try:
        raw = yf.download(
            tickers,
            start=start_date,
            end=end_date,
            progress=False,
            auto_adjust=True,
        )
    except Exception as e:
        return pd.DataFrame(), {}, [{"ticker": t, "reason": f"Download failed: {e}"} for t in tickers]

    if raw is None or raw.empty:
        return pd.DataFrame(), {}, [{"ticker": t, "reason": f"Ticker '{t}' not found — check the symbol or add an exchange suffix (e.g. .HK, .T)"} for t in tickers]

    # Extract closing prices — handle both single-ticker and multi-ticker cases
    if len(tickers) == 1:
        if isinstance(raw.columns, pd.MultiIndex):
            prices = raw[("Close", tickers[0])].to_frame(name=tickers[0])
        else:
            prices = raw["Close"].to_frame(name=tickers[0])
    else:
        if isinstance(raw.columns, pd.MultiIndex):
            prices = raw["Close"]
        else:
            prices = raw[["Close"]].rename(columns={"Close": tickers[0]})

    # Identify failed tickers (no data or insufficient rows)
    good_tickers = []
    for t in tickers:
        if t not in prices.columns:
            failed.append({"ticker": t, "reason": f"Ticker '{t}' not found — check the symbol or add an exchange suffix (e.g. .HK, .T)"})
        elif prices[t].dropna().shape[0] < 5:
            rows = prices[t].dropna().shape[0]
            failed.append({"ticker": t, "reason": f"Only {rows} day{'s' if rows != 1 else ''} of price data available — need at least 5"})
        else:
            good_tickers.append(t)

    if not good_tickers:
        return pd.DataFrame(), {}, failed

    prices = prices[good_tickers]

    # Compute log returns and trim to lookback window
    log_returns = np.log(prices / prices.shift(1)).dropna(how="all")
    log_returns = log_returns.tail(lookback_days)

    # Drop rows with any NaN (handles cross-exchange calendar gaps)
    log_returns = log_returns.dropna()

    # Check we still have enough data after NaN removal
    tickers_to_remove = []
    for t in good_tickers:
        if log_returns[t].shape[0] < 5:
            failed.append({"ticker": t, "reason": f"Only {log_returns[t].shape[0]} aligned returns in lookback window"})
            tickers_to_remove.append(t)

    if tickers_to_remove:
        good_tickers = [t for t in good_tickers if t not in tickers_to_remove]
        if not good_tickers:
            return pd.DataFrame(), {}, failed
        log_returns = log_returns[good_tickers]

    # Fetch metadata (name, currency, last price) for each good ticker
    metadata = {}
    for t in good_tickers:
        last_px = float(prices[t].dropna().iloc[-1])
        try:
            info = yf.Ticker(t).fast_info
            name = getattr(info, "company_name", None) or t
            currency = getattr(info, "currency", None) or "USD"
        except Exception:
            name = t
            currency = "USD"
        metadata[t] = {"name": name, "currency": currency, "last_px": last_px}

    return log_returns, metadata, failed


def _risk_contributions(weights: np.ndarray, cov_matrix: np.ndarray) -> np.ndarray:
    """
    Compute each asset's percentage contribution to portfolio variance.
    RC_i = w_i * (Sigma @ w)_i / (w^T Sigma w)
    Result sums to 1.0.
    """
    port_var = weights @ cov_matrix @ weights
    if port_var <= 0:
        return np.ones(len(weights)) / len(weights)
    marginal = cov_matrix @ weights
    rc = weights * marginal / port_var
    return rc


def _risk_parity_weights(cov_matrix: np.ndarray) -> np.ndarray:
    """
    Compute risk parity (equal risk contribution) weights.

    Objective: minimize sum((RC_i - 1/N)^2)
    Constraints: sum(w) = 1, w_i > 0
    """
    n = cov_matrix.shape[0]

    if n == 1:
        return np.array([1.0])

    # Ridge regularization for near-singular matrices
    cond = np.linalg.cond(cov_matrix)
    if cond > 1e10:
        epsilon = 1e-8 * np.trace(cov_matrix) / n
        cov_matrix = cov_matrix + epsilon * np.eye(n)

    # Initial guess: inverse-vol weights
    vols = np.sqrt(np.diag(cov_matrix))
    vols = np.maximum(vols, 1e-10)
    inv_vol = 1.0 / vols
    w0 = inv_vol / inv_vol.sum()

    target_rc = 1.0 / n

    def objective(w):
        rc = _risk_contributions(w, cov_matrix)
        return np.sum((rc - target_rc) ** 2)

    constraints = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}
    bounds = [(1e-6, 1.0)] * n

    result = minimize(
        objective,
        w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-12},
    )

    if result.success:
        weights = result.x
        weights = np.maximum(weights, 0)
        weights = weights / weights.sum()
        return weights

    # Fallback to inverse-vol if optimizer fails
    return w0


def calculate_portfolio(
    tickers: List[str],
    lookback_days: int,
    total_allocation: float,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Returns (results, failed).
    Uses risk parity (equal risk contribution) weighting via the full
    covariance matrix, accounting for both volatility and correlations.
    """
    calendar_days = int(lookback_days * (365 / 252)) + 60
    end_date = datetime.today().strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=calendar_days)).strftime("%Y-%m-%d")

    log_returns, metadata, failed = _fetch_returns_and_metadata(
        tickers, lookback_days, start_date, end_date
    )

    if log_returns.empty or not metadata:
        return [], failed

    good_tickers = list(log_returns.columns)

    # Annualized covariance matrix (multiply by 252 trading days)
    cov_matrix = log_returns.cov().values * 252

    # Per-ticker annualized realized vol (from diagonal of covariance)
    vols = np.sqrt(np.diag(cov_matrix))

    # Risk parity weights
    weights = _risk_parity_weights(cov_matrix)

    # Risk contributions
    rc = _risk_contributions(weights, cov_matrix)

    results = []
    for i, t in enumerate(good_tickers):
        meta = metadata[t]
        results.append({
            "name": meta["name"],
            "ticker": t,
            "rv": round(float(vols[i]), 6),
            "weight": round(float(weights[i]), 6),
            "position": round(float(weights[i]) * total_allocation, 2),
            "last_px": round(meta["last_px"], 4),
            "currency": meta["currency"],
            "risk_contribution": round(float(rc[i]), 6),
        })

    return results, failed
