import warnings
warnings.filterwarnings("ignore", category=Warning, module="urllib3")

import time
from io import StringIO
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
import yfinance as yf


_YFINANCE_TENORS: Dict[str, str] = {
    "3M": "^IRX",   # 13-week T-bill
    "5Y": "^FVX",
    "10Y": "^TNX",
    "30Y": "^TYX",
}

_FRED_2Y_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2"

_DISPLAY_ORDER: List[str] = ["3M", "2Y", "5Y", "10Y", "30Y"]

_SPREAD_DEFS: List[Tuple[str, str, str]] = [
    ("10Y − 2Y", "10Y", "2Y"),
    ("10Y − 3M", "10Y", "3M"),
    ("30Y − 5Y", "30Y", "5Y"),
]

_CACHE_TTL_SECONDS = 60
_cache: Dict[str, Tuple[float, dict]] = {}


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


def _fetch_yfinance_yields(period: str) -> pd.DataFrame:
    """
    Batch-download the 4 yfinance-available US Treasury yield series.
    Returns a DataFrame indexed by date with columns "3M", "5Y", "10Y", "30Y".
    Empty DataFrame on total failure.
    """
    tickers = list(_YFINANCE_TENORS.values())
    try:
        raw = yf.download(
            tickers,
            period=period,
            progress=False,
            auto_adjust=False,
        )
    except Exception:
        return pd.DataFrame()

    if raw is None or raw.empty:
        return pd.DataFrame()

    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" not in raw.columns.get_level_values(0):
            return pd.DataFrame()
        close = raw["Close"]
    else:
        close = raw[["Close"]].rename(columns={"Close": tickers[0]})

    rename_map = {sym: tenor for tenor, sym in _YFINANCE_TENORS.items()}
    close = close.rename(columns=rename_map)
    keep = [c for c in ["3M", "5Y", "10Y", "30Y"] if c in close.columns]
    return close[keep].dropna(how="all")


def _fetch_fred_2y(period_days: int) -> pd.Series:
    """
    Fetch the US 2Y Treasury constant-maturity yield (DGS2) daily series
    from FRED (St. Louis Fed). Free, no API key required.

    Returns a Series indexed by date (last `period_days` rows). Empty Series on
    failure — the dashboard will show 2Y as `—` and skip 2s10s/3m10s spreads.
    """
    try:
        resp = requests.get(_FRED_2Y_URL, timeout=10)
        resp.raise_for_status()
        df = pd.read_csv(StringIO(resp.text))
    except Exception:
        return pd.Series(dtype=float)

    if df.empty or "observation_date" not in df.columns or "DGS2" not in df.columns:
        return pd.Series(dtype=float)

    df["observation_date"] = pd.to_datetime(df["observation_date"])
    df["DGS2"] = pd.to_numeric(df["DGS2"], errors="coerce")
    series = df.set_index("observation_date")["DGS2"].sort_index().dropna()
    series.index.name = None
    if period_days > 0:
        series = series.tail(period_days)
    return series


def _join_all_tenors(period_days: int) -> pd.DataFrame:
    """
    Build a single date-indexed DataFrame with all 5 tenors as columns,
    using yfinance period strings sized to cover at least period_days.
    """
    if period_days <= 30:
        period_str = "1mo"
    elif period_days <= 90:
        period_str = "3mo"
    elif period_days <= 180:
        period_str = "6mo"
    elif period_days <= 400:
        period_str = "1y"
    elif period_days <= 800:
        period_str = "2y"
    else:
        period_str = "5y"

    yf_df = _fetch_yfinance_yields(period_str)
    s2y = _fetch_fred_2y(period_days + 30)

    if yf_df.empty and s2y.empty:
        return pd.DataFrame()

    if yf_df.empty:
        joined = s2y.to_frame("2Y")
    elif s2y.empty:
        joined = yf_df.copy()
        joined["2Y"] = np.nan
    else:
        joined = yf_df.copy()
        joined["2Y"] = s2y.reindex(joined.index)

    cols = [c for c in _DISPLAY_ORDER if c in joined.columns]
    joined = joined[cols].sort_index()
    if period_days > 0:
        joined = joined.tail(period_days)
    return joined


def get_yield_snapshot() -> dict:
    """
    Latest yield level + day change (bps) for each tenor, plus computed spreads.
    """
    cached = _cached("snapshot")
    if cached is not None:
        return cached

    df = _join_all_tenors(period_days=10)

    failed: List[str] = []
    for tenor in _DISPLAY_ORDER:
        if tenor not in df.columns or df[tenor].dropna().empty:
            failed.append(tenor)

    yields_payload = []
    latest_vals: Dict[str, float] = {}
    prev_vals: Dict[str, float] = {}

    for tenor in _DISPLAY_ORDER:
        if tenor in failed:
            continue
        col = df[tenor].dropna()
        if len(col) == 0:
            failed.append(tenor)
            continue
        latest = float(col.iloc[-1])
        prev = float(col.iloc[-2]) if len(col) >= 2 else latest
        change_bps = (latest - prev) * 100.0  # 1 percentage point = 100 bps
        yields_payload.append({
            "tenor": tenor,
            "yield_pct": round(latest, 4),
            "change_bps": round(change_bps, 2),
        })
        latest_vals[tenor] = latest
        prev_vals[tenor] = prev

    spreads_payload = []
    for name, long_tenor, short_tenor in _SPREAD_DEFS:
        if long_tenor not in latest_vals or short_tenor not in latest_vals:
            continue
        cur_bps = (latest_vals[long_tenor] - latest_vals[short_tenor]) * 100.0
        prev_bps = (prev_vals[long_tenor] - prev_vals[short_tenor]) * 100.0
        spreads_payload.append({
            "name": name,
            "value_bps": round(cur_bps, 2),
            "change_bps": round(cur_bps - prev_bps, 2),
            "inverted": cur_bps < 0,
        })

    as_of = ""
    if not df.empty:
        as_of = df.index[-1].strftime("%Y-%m-%d")

    payload = {
        "yields": yields_payload,
        "spreads": spreads_payload,
        "as_of": as_of,
        "failed": failed,
    }
    _set_cache("snapshot", payload)
    return payload


def get_yield_history(days: int) -> dict:
    """
    Historical daily yields for all tenors, suitable for a multi-line chart.
    """
    cache_key = f"history:{days}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    df = _join_all_tenors(period_days=days)

    if df.empty:
        payload = {"dates": [], "series": {}}
        _set_cache(cache_key, payload)
        return payload

    dates = [d.strftime("%Y-%m-%d") for d in df.index]
    series: Dict[str, List[Optional[float]]] = {}
    for tenor in _DISPLAY_ORDER:
        if tenor in df.columns:
            series[tenor] = [None if pd.isna(v) else round(float(v), 4) for v in df[tenor]]

    payload = {"dates": dates, "series": series}
    _set_cache(cache_key, payload)
    return payload
