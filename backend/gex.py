import warnings
warnings.filterwarnings("ignore", category=Warning, module="urllib3")

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf
from scipy.stats import norm


_TICKERS: List[str] = ["SPY", "QQQ", "IWM", "DIA", "SMH"]

# Risk-free rate for the BS gamma calc. r is a tiny input to d1 for short-
# dated options (r·T ≈ 0.025 at T=0.5, dwarfed by the σ²/2·T term), so a
# rough constant is fine. Update annually if rates move dramatically.
_RISK_FREE_RATE = 0.05

_CACHE_TTL_SECONDS = 900  # 15 min — OI is daily but spot moves matter
_cache: Dict[str, Tuple[float, dict]] = {}

_MIN_DTE_DAYS = 1     # exclude 0DTE
_MAX_DTE_DAYS = 365   # exclude LEAPs
_FLIP_SCAN_PCT = 0.10  # scan ±10% of spot for zero-gamma crossing
_FLIP_SCAN_POINTS = 60


def _cached(key: str):
    entry = _cache.get(key)
    if entry is None:
        return None
    cached_at, payload = entry
    if time.time() - cached_at < _CACHE_TTL_SECONDS:
        return payload
    return None


def _set_cache(key: str, payload: dict) -> None:
    _cache[key] = (time.time(), payload)


def _bs_gamma(S: float, K: np.ndarray, T: np.ndarray, sigma: np.ndarray, r: float) -> np.ndarray:
    """
    Vectorized Black-Scholes gamma over arrays of strikes/expiries/IVs.
    Returns gamma per contract (unitless dG/dS² × 1, NOT scaled by spot²).
    """
    sqrtT = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
    return norm.pdf(d1) / (S * sigma * sqrtT)


def _gex_at_spot(
    S: float,
    strikes: np.ndarray,
    T: np.ndarray,
    iv: np.ndarray,
    oi: np.ndarray,
    side: np.ndarray,
    r: float,
) -> float:
    """
    Total dealer GEX at a given spot S, in dollars per 1% spot move.
    side: +1 for calls, -1 for puts (standard dealer-side convention).
    """
    gamma = _bs_gamma(S, strikes, T, iv, r)
    # 100 multiplier = contract size; S² · 0.01 converts to $/1% move
    contributions = oi * gamma * 100.0 * (S * S) * 0.01 * side
    return float(np.sum(contributions))


def _find_zero_gamma_flip(
    spot: float,
    strikes: np.ndarray,
    T: np.ndarray,
    iv: np.ndarray,
    oi: np.ndarray,
    side: np.ndarray,
    r: float,
) -> Optional[float]:
    """
    Scan spot in ±_FLIP_SCAN_PCT range, find first sign change in total GEX,
    linearly interpolate to the crossing. Returns None if no crossing in range.
    """
    lo = spot * (1.0 - _FLIP_SCAN_PCT)
    hi = spot * (1.0 + _FLIP_SCAN_PCT)
    scan_prices = np.linspace(lo, hi, _FLIP_SCAN_POINTS)
    gex_curve = np.array([
        _gex_at_spot(p, strikes, T, iv, oi, side, r) for p in scan_prices
    ])

    # Find first sign change
    signs = np.sign(gex_curve)
    for i in range(1, len(signs)):
        if signs[i - 1] != signs[i] and signs[i - 1] != 0 and signs[i] != 0:
            p1, p2 = scan_prices[i - 1], scan_prices[i]
            g1, g2 = gex_curve[i - 1], gex_curve[i]
            if g2 == g1:
                return float((p1 + p2) / 2.0)
            return float(p1 + (0.0 - g1) * (p2 - p1) / (g2 - g1))

    return None


def _build_contract_arrays(
    chains: List[Tuple[pd.DataFrame, pd.DataFrame, float]],
) -> Optional[Tuple[np.ndarray, ...]]:
    """
    Stack call/put rows from all expiries into a single set of numpy arrays.
    Each input tuple is (calls_df, puts_df, T_years).
    Drops rows with NaN/zero IV or zero OI.
    Returns (strikes, T, iv, oi, side) or None if nothing valid.
    """
    rows = []
    for calls, puts, T in chains:
        for df, side_sign in ((calls, +1.0), (puts, -1.0)):
            if df is None or df.empty:
                continue
            sub = df[["strike", "openInterest", "impliedVolatility"]].copy()
            sub = sub.dropna()
            sub = sub[(sub["openInterest"] > 0) & (sub["impliedVolatility"] > 0)]
            if sub.empty:
                continue
            sub["T"] = T
            sub["side"] = side_sign
            rows.append(sub)

    if not rows:
        return None

    df = pd.concat(rows, ignore_index=True)
    return (
        df["strike"].to_numpy(dtype=float),
        df["T"].to_numpy(dtype=float),
        df["impliedVolatility"].to_numpy(dtype=float),
        df["openInterest"].to_numpy(dtype=float),
        df["side"].to_numpy(dtype=float),
    )


def _compute_ticker_gex(symbol: str, r: float, today: datetime) -> Optional[dict]:
    """
    Fetch all in-window expiries for `symbol` from yfinance and compute total
    GEX, regime, and zero-gamma flip. Returns None if no chains could be loaded.
    """
    try:
        t = yf.Ticker(symbol)
        spot = float(t.fast_info.last_price)
        expiries = t.options
    except Exception:
        return None

    if not expiries or spot <= 0:
        return None

    chains = []
    for expiry_str in expiries:
        try:
            expiry_dt = datetime.strptime(expiry_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        dte = (expiry_dt - today).total_seconds() / 86400.0
        if dte < _MIN_DTE_DAYS or dte > _MAX_DTE_DAYS:
            continue
        T_years = dte / 365.0
        try:
            chain = t.option_chain(expiry_str)
        except Exception:
            continue
        chains.append((chain.calls, chain.puts, T_years))

    if not chains:
        return None

    arrays = _build_contract_arrays(chains)
    if arrays is None:
        return None
    strikes, T, iv, oi, side = arrays

    total_gex = _gex_at_spot(spot, strikes, T, iv, oi, side, r)
    flip = _find_zero_gamma_flip(spot, strikes, T, iv, oi, side, r)
    spot_minus_flip = (spot - flip) if flip is not None else None

    return {
        "symbol": symbol,
        "spot": round(spot, 4),
        "total_gex": round(total_gex, 2),
        "regime": "vol_suppressing" if total_gex >= 0 else "vol_amplifying",
        "zero_gamma_flip": round(flip, 4) if flip is not None else None,
        "spot_minus_flip": round(spot_minus_flip, 4) if spot_minus_flip is not None else None,
        "contracts_included": int(len(strikes)),
    }


def get_gex_snapshot() -> dict:
    """
    Aggregate GEX for all _TICKERS in parallel. Cached for 15 min.
    """
    cached = _cached("snapshot")
    if cached is not None:
        return cached

    r = _RISK_FREE_RATE
    today = datetime.now(timezone.utc)

    results: Dict[str, Optional[dict]] = {}
    with ThreadPoolExecutor(max_workers=len(_TICKERS)) as executor:
        futures = {
            executor.submit(_compute_ticker_gex, sym, r, today): sym
            for sym in _TICKERS
        }
        for fut in as_completed(futures):
            sym = futures[fut]
            try:
                results[sym] = fut.result()
            except Exception:
                results[sym] = None

    tickers_payload = []
    failed: List[str] = []
    for sym in _TICKERS:  # preserve declared order
        r_data = results.get(sym)
        if r_data is None:
            failed.append(sym)
        else:
            tickers_payload.append(r_data)

    payload = {
        "tickers": tickers_payload,
        "as_of": today.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "failed": failed,
    }
    _set_cache("snapshot", payload)
    return payload
