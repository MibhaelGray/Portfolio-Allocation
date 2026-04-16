from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    CalculateRequest, CalculateResponse, TickerResult, FailedTicker,
    CorrelationData, SimulateRequest, SimulateResponse, FanChartPoint,
    HistogramBin, GarchParams, SimulationSummary,
)
from calculator import calculate_portfolio, _fetch_returns_and_metadata, build_correlation_payload
from simulator import fit_garch_models, compute_residual_correlation, simulate_paths, compute_simulation_statistics, build_garch_params
import numpy as np
from datetime import datetime, timedelta

app = FastAPI(title="Portfolio Allocation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/calculate", response_model=CalculateResponse)
async def calculate(req: CalculateRequest):
    if not req.tickers:
        raise HTTPException(status_code=422, detail="At least one ticker is required")

    seen = set()
    deduped = []
    for t in req.tickers:
        key = t.strip().upper()
        if key and key not in seen:
            seen.add(key)
            deduped.append(t.strip())

    results_raw, failed_raw, effective_lookback, correlation_raw = calculate_portfolio(
        deduped, req.lookback_days, req.total_allocation
    )

    return CalculateResponse(
        results=[TickerResult(**r) for r in results_raw],
        failed=[FailedTicker(**f) for f in failed_raw],
        effective_lookback_days=effective_lookback,
        correlation=CorrelationData(**correlation_raw) if correlation_raw else None,
    )


@app.post("/api/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest):
    if not req.tickers:
        raise HTTPException(status_code=422, detail="At least one ticker is required")
    if len(req.tickers) != len(req.weights):
        raise HTTPException(status_code=422, detail="tickers and weights must have the same length")

    weight_sum = sum(req.weights)
    if abs(weight_sum - 1.0) > 0.05:
        raise HTTPException(status_code=422, detail=f"Weights must sum to ~1.0, got {weight_sum:.4f}")

    # Normalize weights
    weights = np.array(req.weights)
    weights = weights / weights.sum()

    # Deduplicate tickers (preserving weight mapping)
    seen = set()
    deduped_tickers = []
    deduped_weights = []
    for t, w in zip(req.tickers, weights):
        key = t.strip().upper()
        if key and key not in seen:
            seen.add(key)
            deduped_tickers.append(t.strip())
            deduped_weights.append(w)

    weights = np.array(deduped_weights)
    weights = weights / weights.sum()

    # Fetch log returns using same function as /api/calculate
    calendar_days = int(req.lookback_days * (365 / 252)) + 90
    end_date = datetime.today().strftime("%Y-%m-%d")
    start_date = (datetime.today() - timedelta(days=calendar_days)).strftime("%Y-%m-%d")

    log_returns, metadata, failed_raw = _fetch_returns_and_metadata(
        deduped_tickers, req.lookback_days, start_date, end_date
    )

    if log_returns.empty:
        raise HTTPException(status_code=422, detail="No valid ticker data available for simulation")

    good_tickers = list(log_returns.columns)
    effective_lookback = int(log_returns.shape[0])
    failed = [FailedTicker(**f) for f in failed_raw]

    # Re-align weights to only good tickers
    ticker_weight_map = {t.upper(): w for t, w in zip(deduped_tickers, weights)}
    good_weights = np.array([ticker_weight_map.get(t.upper(), 0) for t in good_tickers])
    if good_weights.sum() > 0:
        good_weights = good_weights / good_weights.sum()
    else:
        raise HTTPException(status_code=422, detail="No valid tickers remaining after data fetch")

    # Correlation heatmap payload — uses the aligned log_returns we already fetched.
    correlation_raw = build_correlation_payload(log_returns[good_tickers])

    # Fit GARCH models
    garch_results = fit_garch_models(log_returns)

    # Compute residual correlation + Cholesky
    corr, cholesky_L = compute_residual_correlation(garch_results, good_tickers)

    # Run simulation
    portfolio_values, cap_trigger_count, seed_used = simulate_paths(
        garch_results, good_tickers, good_weights, cholesky_L,
        req.horizon_days, req.num_simulations, req.total_allocation,
        seed=req.seed,
    )

    # Compute statistics
    stats = compute_simulation_statistics(portfolio_values, req.total_allocation)

    # Build GARCH parameter summaries
    garch_params = build_garch_params(garch_results, good_tickers)

    return SimulateResponse(
        fan_chart=[FanChartPoint(**p) for p in stats["fan_chart"]],
        histogram=[HistogramBin(**b) for b in stats["histogram"]],
        summary=SimulationSummary(**stats["summary"]),
        garch_params=[GarchParams(**g) for g in garch_params],
        horizon_days=req.horizon_days,
        num_simulations=req.num_simulations,
        effective_lookback_days=effective_lookback,
        seed=seed_used,
        cap_trigger_count=cap_trigger_count,
        failed=failed,
        correlation=CorrelationData(**correlation_raw) if correlation_raw else None,
    )
