from pydantic import BaseModel, Field
from typing import List, Optional


class CalculateRequest(BaseModel):
    tickers: List[str]
    lookback_days: int = Field(default=63, ge=5, le=504)
    total_allocation: float = Field(default=5000.0, gt=0)


class TickerResult(BaseModel):
    name: str
    ticker: str
    rv: float
    weight: float
    position: float
    last_px: float
    currency: str
    risk_contribution: float


class FailedTicker(BaseModel):
    ticker: str
    reason: str


class CalculateResponse(BaseModel):
    results: List[TickerResult]
    failed: List[FailedTicker]
    effective_lookback_days: int = 0


# ── Monte Carlo Simulation models ────────────────────────────

class SimulateRequest(BaseModel):
    tickers: List[str]
    weights: List[float]
    lookback_days: int = Field(default=63, ge=5, le=504)
    total_allocation: float = Field(default=5000.0, gt=0)
    horizon_days: int = Field(default=126, ge=21, le=504)
    num_simulations: int = Field(default=5000, ge=500, le=25000)
    seed: Optional[int] = Field(default=None, ge=0, le=2**31 - 1)


class FanChartPoint(BaseModel):
    day: int
    p5: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    p95: float


class HistogramBin(BaseModel):
    bin_start: float
    bin_end: float
    count: int


class GarchParams(BaseModel):
    ticker: str
    omega: float
    alpha: float
    beta: float
    nu: float
    persistence: float
    unconditional_vol: float
    half_life_days: float
    fallback_used: bool


class SimulationSummary(BaseModel):
    mean_return_pct: float
    median_return_pct: float
    annualized_vol_pct: float
    var_5_pct: float
    cvar_5_pct: float
    probability_of_loss_pct: float
    best_case_pct: float
    worst_case_pct: float
    median_max_drawdown_pct: float


class SimulateResponse(BaseModel):
    fan_chart: List[FanChartPoint]
    histogram: List[HistogramBin]
    summary: SimulationSummary
    garch_params: List[GarchParams]
    horizon_days: int
    num_simulations: int
    effective_lookback_days: int
    seed: int
    cap_trigger_count: int
    failed: List[FailedTicker]
