export interface TickerResult {
  name: string;
  ticker: string;
  rv: number;
  weight: number;
  position: number;
  last_px: number;
  currency: string;
  risk_contribution: number;
}

export interface FailedTicker {
  ticker: string;
  reason: string;
}

export interface CalculateRequest {
  tickers: string[];
  lookback_days: number;
  total_allocation: number;
}

export interface CorrelationData {
  tickers: string[];
  matrix: number[][];
}

export interface CalculateResponse {
  results: TickerResult[];
  failed: FailedTicker[];
  effective_lookback_days: number;
  correlation: CorrelationData | null;
}

export interface CorrelationRequest {
  tickers: string[];
  lookback_days: number;
}

export interface CorrelationResponse {
  correlation: CorrelationData | null;
  failed: FailedTicker[];
}

// ── Monte Carlo Simulation types ────────────────────────────

export interface SimulateRequest {
  tickers: string[];
  weights: number[];
  lookback_days: number;
  total_allocation: number;
  horizon_days: number;
  num_simulations: number;
  seed?: number | null;
}

export interface FanChartPoint {
  day: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface GarchParams {
  ticker: string;
  omega: number;
  alpha: number;
  beta: number;
  nu: number;
  persistence: number;
  unconditional_vol: number;
  half_life_days: number;
  fallback_used: boolean;
}

export interface SimulationSummary {
  mean_return_pct: number;
  median_return_pct: number;
  annualized_vol_pct: number;
  var_5_pct: number;
  cvar_5_pct: number;
  probability_of_loss_pct: number;
  best_case_pct: number;
  worst_case_pct: number;
  median_max_drawdown_pct: number;
}

export interface SimulateResponse {
  fan_chart: FanChartPoint[];
  histogram: HistogramBin[];
  summary: SimulationSummary;
  garch_params: GarchParams[];
  horizon_days: number;
  num_simulations: number;
  effective_lookback_days: number;
  seed: number;
  cap_trigger_count: number;
  failed: FailedTicker[];
  correlation: CorrelationData | null;
}
