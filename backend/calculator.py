import warnings
warnings.filterwarnings("ignore", category=Warning, module="urllib3")

import yfinance as yf
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.cluster.hierarchy import linkage, leaves_list
from scipy.spatial.distance import squareform
from sklearn.covariance import LedoitWolf
from datetime import datetime, timedelta
from typing import Tuple, List, Dict


def _fetch_fx_series(
    currencies: List[str],
    price_index: pd.DatetimeIndex,
    start_date: str,
    end_date: str,
) -> Dict[str, pd.Series]:
    """
    Build a {currency -> Series of USD-per-unit} map aligned to price_index.

    Forward/back-fills FX gaps so weekday equity prices always have a rate.
    USD maps to a constant 1.0 series. London pence (GBp/GBX) is normalized to
    GBP — the constant 1/100 scale doesn't affect log returns; only the FX
    volatility component matters for the covariance matrix.

    If a given FX series fails to download, falls back to 1.0 — that asset's
    USD vol will be missing the FX component, but the system stays operational.
    """
    one = pd.Series(1.0, index=price_index)
    fx_map: Dict[str, pd.Series] = {}

    norm = {c: ("GBP" if c in ("GBp", "GBX") else c) for c in set(currencies)}
    needed = sorted({n for n in norm.values() if n != "USD"})

    if not needed:
        for c in set(currencies):
            fx_map[c] = one
        return fx_map

    fx_tickers = [f"{c}USD=X" for c in needed]
    try:
        fx_raw = yf.download(
            fx_tickers,
            start=start_date,
            end=end_date,
            progress=False,
            auto_adjust=True,
        )
    except Exception:
        fx_raw = None

    fx_close = pd.DataFrame()
    if fx_raw is not None and not fx_raw.empty:
        if len(fx_tickers) == 1:
            if isinstance(fx_raw.columns, pd.MultiIndex):
                fx_close = fx_raw[("Close", fx_tickers[0])].to_frame(name=fx_tickers[0])
            else:
                fx_close = fx_raw["Close"].to_frame(name=fx_tickers[0])
        else:
            if isinstance(fx_raw.columns, pd.MultiIndex):
                fx_close = fx_raw["Close"]
            else:
                fx_close = fx_raw[["Close"]].rename(columns={"Close": fx_tickers[0]})

        fx_close = fx_close.reindex(price_index).ffill().bfill()

    for c in set(currencies):
        n = norm[c]
        if n == "USD":
            fx_map[c] = one
            continue
        ticker = f"{n}USD=X"
        if not fx_close.empty and ticker in fx_close.columns and not fx_close[ticker].isna().all():
            fx_map[c] = fx_close[ticker]
        else:
            fx_map[c] = one

    return fx_map


def _fetch_returns_and_metadata(
    tickers: List[str],
    lookback_days: int,
    start_date: str,
    end_date: str,
) -> Tuple[pd.DataFrame, Dict[str, Dict], List[Dict]]:
    """
    Batch-download prices, convert to USD, compute aligned USD log returns,
    and fetch metadata.

    Returns:
      - log_returns: DataFrame (lookback_days x N) of USD-perspective aligned
        log returns. For non-USD assets this includes the FX leg, so the
        resulting covariance reflects the risk a USD investor actually bears.
      - metadata: dict of ticker -> {name, currency, last_px}. last_px is in
        the asset's native currency (matches what the exchange displays).
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

    # Fetch metadata (name, native currency, native last price) BEFORE log returns
    # — we need each ticker's currency to fetch the right FX series.
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

    # Convert each ticker's price series to USD. For a USD investor, the
    # economically meaningful return is on (native_price × FX_to_USD); using
    # native-currency returns silently strips out the FX volatility leg.
    fx_map = _fetch_fx_series(
        currencies=[metadata[t]["currency"] for t in good_tickers],
        price_index=prices.index,
        start_date=start_date,
        end_date=end_date,
    )
    usd_prices = pd.DataFrame(index=prices.index)
    for t in good_tickers:
        usd_prices[t] = prices[t] * fx_map[metadata[t]["currency"]]

    # Compute log returns from USD-converted prices. Align across good_tickers
    # FIRST (drop any-NaN rows for cross-exchange calendar gaps), THEN take
    # tail(lookback_days) — guarantees the user gets lookback_days of aligned
    # observations whenever enough history exists.
    log_returns_raw = np.log(usd_prices / usd_prices.shift(1)).dropna(how="all")
    log_returns = log_returns_raw[good_tickers].dropna().tail(lookback_days)

    # Check each ticker still has enough aligned rows
    tickers_to_remove = []
    for t in good_tickers:
        if log_returns[t].shape[0] < 5:
            failed.append({"ticker": t, "reason": f"Only {log_returns[t].shape[0]} aligned returns in lookback window"})
            tickers_to_remove.append(t)

    if tickers_to_remove:
        good_tickers = [t for t in good_tickers if t not in tickers_to_remove]
        if not good_tickers:
            return pd.DataFrame(), {}, failed
        # Re-align with the remaining tickers — may widen the window if the removed
        # ticker was forcing NaN drops.
        log_returns = log_returns_raw[good_tickers].dropna().tail(lookback_days)
        metadata = {t: metadata[t] for t in good_tickers}

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


def _correlation_from_cov(cov_matrix: np.ndarray) -> np.ndarray:
    """Derive correlation matrix from covariance. Scale by 1/(σ_i σ_j)."""
    vols = np.sqrt(np.diag(cov_matrix))
    vols = np.maximum(vols, 1e-12)
    corr = cov_matrix / np.outer(vols, vols)
    # Clip numerical fuzz outside [-1, 1] and hard-pin the diagonal.
    corr = np.clip(corr, -1.0, 1.0)
    np.fill_diagonal(corr, 1.0)
    return corr


def _cluster_order(corr: np.ndarray) -> np.ndarray:
    """
    Hierarchical clustering (average linkage) on correlation distance.
    Returns a permutation of indices that places similar assets adjacent.
    """
    n = corr.shape[0]
    if n <= 2:
        return np.arange(n)
    # Distance = √(2(1 - ρ)): standard correlation-to-distance transform.
    dist = np.sqrt(np.maximum(2.0 * (1.0 - corr), 0.0))
    np.fill_diagonal(dist, 0.0)
    condensed = squareform(dist, checks=False)
    Z = linkage(condensed, method="average")
    return leaves_list(Z)


def build_correlation_payload(log_returns: pd.DataFrame) -> Dict:
    """
    Build the API-shaped correlation dict from aligned log returns.
    Uses the same LW-shrunk covariance as risk parity so both endpoints
    return identical numbers for the same ticker set and lookback.

    Returns {} when no tickers. For n=1 returns a trivial [[1.0]] matrix
    so the live-heatmap UI can show a single cell as the portfolio grows.
    """
    tickers = list(log_returns.columns)
    if not tickers:
        return {}
    if len(tickers) == 1:
        return {"tickers": tickers, "matrix": [[1.0]]}
    cov = LedoitWolf(assume_centered=True).fit(log_returns.values).covariance_
    corr = _correlation_from_cov(cov)
    order = _cluster_order(corr)
    ordered_tickers = [tickers[i] for i in order]
    ordered_corr = corr[np.ix_(order, order)]
    return {
        "tickers": ordered_tickers,
        "matrix": [[round(float(v), 4) for v in row] for row in ordered_corr],
    }


def calculate_portfolio(
    tickers: List[str],
    lookback_days: int,
    total_allocation: float,
) -> Tuple[List[Dict], List[Dict], int, Dict]:
    """
    Returns (results, failed, effective_lookback_days, correlation).
    Uses risk parity (equal risk contribution) weighting via the full
    covariance matrix, accounting for both volatility and correlations.

    effective_lookback_days is the actual number of aligned return observations
    used — may be less than requested lookback_days if total available history
    is shorter.

    correlation: dict with 'tickers' (clustered order) and 'matrix' (2D list).
    Empty dict if fewer than 2 tickers succeeded.
    """
    # Buffer +90 calendar days to absorb weekends, holidays, and cross-exchange alignment loss.
    calendar_days = int(lookback_days * (365 / 252)) + 90
    end_date = datetime.today().strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=calendar_days)).strftime("%Y-%m-%d")

    log_returns, metadata, failed = _fetch_returns_and_metadata(
        tickers, lookback_days, start_date, end_date
    )

    if log_returns.empty or not metadata:
        return [], failed, 0, {}

    good_tickers = list(log_returns.columns)
    effective_lookback = int(log_returns.shape[0])

    # Annualized covariance matrix (Ledoit-Wolf shrinkage, multiply by 252 trading days).
    # assume_centered=True: daily means are economically ~0 and the sample mean is
    # dominated by noise over short lookbacks; estimating it burns one DOF of signal.
    cov_matrix = LedoitWolf(assume_centered=True).fit(log_returns.values).covariance_ * 252

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

    # Correlation matrix + hierarchical clustering order, for the heatmap.
    correlation = build_correlation_payload(log_returns)

    return results, failed, effective_lookback, correlation
