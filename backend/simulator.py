import warnings
warnings.filterwarnings("ignore", category=Warning, module="arch")
warnings.filterwarnings("ignore", category=Warning, module="scipy")

import numpy as np
import pandas as pd
from scipy.stats import t as t_dist
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def _constant_variance_fallback(
    ticker: str,
    returns_pct: np.ndarray,
    reason: str,
) -> Dict:
    """Honest constant-variance bundle. Used when GARCH fit fails or hits
    near-IGARCH territory where unconditional variance is undefined."""
    logger.warning(f"GARCH fallback for {ticker}: {reason}")
    sample_var = float(np.var(returns_pct, ddof=1))
    sample_std = float(np.std(returns_pct, ddof=1))
    return {
        "ticker": ticker,
        "omega": max(sample_var, 1e-8),
        "alpha": 0.0,
        "beta": 0.0,
        "nu": 30.0,
        "last_cond_var": max(sample_var, 1e-8),
        "std_resids": (returns_pct - returns_pct.mean()) / max(sample_std, 1e-8),
        "fallback_used": True,
    }


def _fit_single_garch(ticker: str, returns_pct: np.ndarray) -> Dict:
    """Fit GARCH(1,1) with Student-t innovations for a single asset."""
    from arch import arch_model

    try:
        model = arch_model(
            returns_pct,
            vol="GARCH",
            p=1,
            q=1,
            dist="t",
            mean="Zero",
            rescale=False,
        )
        result = model.fit(disp="off", show_warning=False)

        omega = float(result.params.get("omega", 0))
        alpha = float(result.params.get("alpha[1]", 0))
        beta = float(result.params.get("beta[1]", 0))
        nu = float(result.params.get("nu", 30))

        # Ensure positivity
        omega = max(omega, 1e-8)
        alpha = max(alpha, 0)
        beta = max(beta, 0)
        persistence = alpha + beta

        # Stationarity check: if the fit lands in (near-)IGARCH territory the
        # unconditional variance omega/(1-persistence) is undefined. Rescaling
        # alpha/beta post hoc (prior behavior) produces parameters inconsistent
        # with the MLE and breaks downstream reporting (half-life, uncond vol).
        # Route to the constant-variance fallback instead — honest and consistent.
        if persistence >= 0.999:
            return _constant_variance_fallback(
                ticker, returns_pct,
                f"near-IGARCH fit (alpha+beta={persistence:.4f} ≥ 0.999)",
            )

        cond_vol = result.conditional_volatility
        last_cond_var = float(cond_vol.iloc[-1] ** 2) if hasattr(cond_vol, 'iloc') else float(cond_vol[-1] ** 2)
        resids = result.std_resid
        std_resids = resids.dropna().values if hasattr(resids, 'dropna') else resids[~np.isnan(resids)]

        return {
            "ticker": ticker,
            "omega": omega,
            "alpha": alpha,
            "beta": beta,
            "nu": max(nu, 2.1),
            "last_cond_var": last_cond_var,
            "std_resids": std_resids,
            "fallback_used": False,
        }

    except Exception as e:
        return _constant_variance_fallback(ticker, returns_pct, f"fit exception: {e}")


def fit_garch_models(log_returns: pd.DataFrame) -> Dict[str, Dict]:
    """Fit GARCH(1,1)-t models for all assets in parallel."""
    results = {}

    with ThreadPoolExecutor(max_workers=min(8, len(log_returns.columns))) as executor:
        futures = {}
        for ticker in log_returns.columns:
            returns_pct = log_returns[ticker].values * 100  # arch expects percentage returns
            futures[executor.submit(_fit_single_garch, ticker, returns_pct)] = ticker

        for future in as_completed(futures):
            ticker = futures[future]
            results[ticker] = future.result()

    return results


def compute_residual_correlation(
    garch_results: Dict[str, Dict], tickers: List[str]
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute correlation matrix of standardized residuals and its Cholesky factor."""
    n = len(tickers)

    if n == 1:
        return np.array([[1.0]]), np.array([[1.0]])

    # Align residuals to same length
    min_len = min(len(garch_results[t]["std_resids"]) for t in tickers)
    resid_matrix = np.column_stack([
        garch_results[t]["std_resids"][-min_len:] for t in tickers
    ])

    corr = np.corrcoef(resid_matrix, rowvar=False)

    # Ensure positive definiteness via eigenvalue clipping
    eigenvalues, eigenvectors = np.linalg.eigh(corr)
    eigenvalues = np.maximum(eigenvalues, 1e-8)
    corr = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
    # Re-normalize to correlation matrix
    d = np.sqrt(np.diag(corr))
    corr = corr / np.outer(d, d)
    np.fill_diagonal(corr, 1.0)

    cholesky_L = np.linalg.cholesky(corr)
    return corr, cholesky_L


def simulate_paths(
    garch_results: Dict[str, Dict],
    tickers: List[str],
    weights: np.ndarray,
    cholesky_L: np.ndarray,
    horizon_days: int,
    num_simulations: int,
    total_allocation: float,
    seed: Optional[int] = None,
) -> Tuple[np.ndarray, int, int]:
    """
    Run vectorized Monte Carlo simulation with GARCH-t dynamics.
    Returns (portfolio_values, cap_trigger_count, seed_used).
      portfolio_values: (num_simulations, horizon_days + 1)
      cap_trigger_count: number of (sim, asset, day) cells where h hit the
        numerical safeguard cap. Should be ~0 for well-behaved fits; large
        values signal genuine runaway that was silently truncated.
      seed_used: the seed actually used — freshly drawn if input seed was None.
    """
    n_assets = len(tickers)
    if seed is None:
        # Draw a fresh reproducible seed from a seedless bootstrap RNG, then
        # echo it back so the user can replay the exact same paths if desired.
        seed = int(np.random.default_rng().integers(0, 2**31 - 1))
    rng = np.random.default_rng(seed=seed)

    # Extract GARCH parameters as arrays for vectorization
    omegas = np.array([garch_results[t]["omega"] for t in tickers])
    alphas = np.array([garch_results[t]["alpha"] for t in tickers])
    betas = np.array([garch_results[t]["beta"] for t in tickers])
    nus = np.array([garch_results[t]["nu"] for t in tickers])
    last_h = np.array([garch_results[t]["last_cond_var"] for t in tickers])

    # Pooled ν̄ for the t-copula. The dependence structure lives in a
    # multivariate-t with df = ν̄; marginals get remapped to their own ν_i
    # via the probability-integral transform. Median is robust to a single
    # outlier-fitted asset. Floored at 2.5 so Var(t) is finite.
    nu_bar = max(float(np.median(nus)), 2.5)
    # Pre-compute per-asset standardization scale for the target marginals.
    scale_i = np.sqrt(nus / (nus - 2.0))

    # Initialize: (num_simulations, n_assets)
    h = np.tile(last_h, (num_simulations, 1))

    # Soft numerical safeguard on conditional variance. Takes the larger of
    # 100× starting variance and (20× long-run daily stddev)². Only trips on
    # true numerical runaway, not on plausible crisis vol — the prior 10×
    # last_h cap clipped every crisis scenario, biasing VaR/CVaR toward safety.
    persistences = alphas + betas
    safe_denom = np.maximum(1.0 - persistences, 0.01)
    long_run_var = omegas / safe_denom
    h_cap = np.maximum(100.0 * last_h, 400.0 * long_run_var)

    cap_trigger_count = 0

    # Portfolio value paths: (num_simulations, horizon_days + 1)
    portfolio_values = np.empty((num_simulations, horizon_days + 1))
    portfolio_values[:, 0] = total_allocation

    # Apple Accelerate BLAS raises spurious divide/overflow/invalid flags from
    # matmul even on clean inputs with clean outputs (known numpy+macOS issue).
    # Suppress locally around the hot loop so logs stay readable; output
    # sanity is still validated via h_cap trigger tracking.
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        for day in range(1, horizon_days + 1):
            # ── t-copula sampling (McNeil-Frey-Embrechts §5.5) ──────────────
            # 1. Correlated standard normals: Z ~ N(0, C) where C = L L^T.
            Z = rng.standard_normal((num_simulations, n_assets)) @ cholesky_L.T
            # 2. Per-path chi-squared scaling: one W shared across assets so
            #    T = Z/√W is multivariate-t with df = ν̄ and correlation C.
            #    Shared W creates joint tail dependence — independent per-asset
            #    W's would reduce to a Gaussian copula in the limit. Floor W
            #    at 1e-6 as numerical safeguard: P(χ²/ν < 1e-6) is
            #    astronomically small and untruncated draws produce
            #    finite-but-preposterous T that overflow exp() in compounding.
            W = rng.chisquare(df=nu_bar, size=num_simulations) / nu_bar
            W = np.maximum(W, 1e-6)
            T = Z / np.sqrt(W)[:, None]
            # 3. PIT to uniform via the t_{ν̄} CDF. Clip away from {0,1} so
            #    the inverse CDF in step 4 doesn't produce ±inf in the tail.
            U = np.clip(t_dist.cdf(T, df=nu_bar), 1e-12, 1.0 - 1e-12)
            # 4. Map each uniform column to its asset's target marginal
            #    t_{ν_i} and rescale to unit variance so GARCH stays on spec.
            innovations = np.empty((num_simulations, n_assets))
            for i in range(n_assets):
                innovations[:, i] = t_dist.ppf(U[:, i], df=nus[i]) / scale_i[i]
            # ────────────────────────────────────────────────────────────────

            # Daily log returns in percentage space: r = sqrt(h) * epsilon
            sigma = np.sqrt(np.maximum(h, 1e-12))
            returns_pct = sigma * innovations

            # Update conditional variance. The ±25% per-day return clip was
            # removed: Student-t with ν > 2 has finite variance, and the clip
            # systematically truncated crisis-day magnitudes that a risk tool
            # should be reporting.
            h_new = omegas + alphas * (returns_pct ** 2) + betas * h
            hit_cap = h_new > h_cap
            cap_trigger_count += int(hit_cap.sum())
            h = np.minimum(h_new, h_cap)

            # Compound weighted-average simple return. Weighted sum of log
            # returns is NOT the log return of the portfolio (log is not
            # linear); Σ wᵢ·exp(rᵢ) is correct.
            returns_decimal = returns_pct / 100.0
            asset_gross = np.exp(returns_decimal)
            portfolio_gross = asset_gross @ weights
            portfolio_values[:, day] = portfolio_values[:, day - 1] * portfolio_gross

    return portfolio_values, cap_trigger_count, seed


def compute_simulation_statistics(
    portfolio_values: np.ndarray,
    total_allocation: float,
) -> Dict:
    """Compute fan chart data, terminal histogram, and summary statistics."""
    num_simulations, num_days = portfolio_values.shape
    horizon_days = num_days - 1

    # Fan chart: percentiles at each time step
    percentiles = [5, 10, 25, 50, 75, 90, 95]
    pct_values = np.percentile(portfolio_values, percentiles, axis=0)  # (7, horizon_days+1)

    fan_chart = []
    for day in range(num_days):
        fan_chart.append({
            "day": day,
            "p5": round(float(pct_values[0, day]), 2),
            "p10": round(float(pct_values[1, day]), 2),
            "p25": round(float(pct_values[2, day]), 2),
            "p50": round(float(pct_values[3, day]), 2),
            "p75": round(float(pct_values[4, day]), 2),
            "p90": round(float(pct_values[5, day]), 2),
            "p95": round(float(pct_values[6, day]), 2),
        })

    # Terminal value histogram
    terminal_values = portfolio_values[:, -1]
    counts, bin_edges = np.histogram(terminal_values, bins=50)
    histogram = []
    for i in range(len(counts)):
        histogram.append({
            "bin_start": round(float(bin_edges[i]), 2),
            "bin_end": round(float(bin_edges[i + 1]), 2),
            "count": int(counts[i]),
        })

    # Summary statistics
    terminal_returns = (terminal_values - total_allocation) / total_allocation
    mean_return = float(np.mean(terminal_returns))
    median_return = float(np.median(terminal_returns))

    # Annualized vol from terminal returns
    terminal_log_returns = np.log(terminal_values / total_allocation)
    daily_equiv_vol = float(np.std(terminal_log_returns)) / np.sqrt(horizon_days)
    annualized_vol = daily_equiv_vol * np.sqrt(252)

    # VaR and CVaR (5th percentile)
    sorted_returns = np.sort(terminal_returns)
    var_idx = int(0.05 * num_simulations)
    var_5 = float(sorted_returns[var_idx])
    cvar_5 = float(np.mean(sorted_returns[:var_idx])) if var_idx > 0 else var_5

    # Probability of loss
    prob_loss = float(np.mean(terminal_values < total_allocation))

    # Best/worst case
    best_case = float(np.percentile(terminal_returns, 95))
    worst_case = float(np.percentile(terminal_returns, 5))

    # Max drawdown per path
    running_max = np.maximum.accumulate(portfolio_values, axis=1)
    drawdowns = (portfolio_values - running_max) / running_max
    max_drawdowns = np.min(drawdowns, axis=1)
    median_max_dd = float(np.median(max_drawdowns))

    summary = {
        "mean_return_pct": round(mean_return * 100, 2),
        "median_return_pct": round(median_return * 100, 2),
        "annualized_vol_pct": round(annualized_vol * 100, 2),
        "var_5_pct": round(var_5 * 100, 2),
        "cvar_5_pct": round(cvar_5 * 100, 2),
        "probability_of_loss_pct": round(prob_loss * 100, 2),
        "best_case_pct": round(best_case * 100, 2),
        "worst_case_pct": round(worst_case * 100, 2),
        "median_max_drawdown_pct": round(median_max_dd * 100, 2),
    }

    return {
        "fan_chart": fan_chart,
        "histogram": histogram,
        "summary": summary,
    }


def build_garch_params(garch_results: Dict[str, Dict], tickers: List[str]) -> List[Dict]:
    """Build per-asset GARCH parameter summaries for the response."""
    params = []
    for t in tickers:
        r = garch_results[t]
        omega = r["omega"]
        alpha = r["alpha"]
        beta = r["beta"]
        persistence = alpha + beta

        # Unconditional variance (in pct^2 space), convert to annualized decimal vol
        if persistence < 1.0:
            uncond_var = omega / (1 - persistence)
            uncond_vol_annual = np.sqrt(uncond_var * 252) / 100  # pct to decimal, then annualize
        else:
            uncond_vol_annual = 0.0

        # Half-life of vol shocks
        if 0 < persistence < 1.0:
            half_life = -np.log(2) / np.log(persistence)
        else:
            half_life = float("inf")

        params.append({
            "ticker": t,
            "omega": round(omega, 6),
            "alpha": round(alpha, 4),
            "beta": round(beta, 4),
            "nu": round(r["nu"], 2),
            "persistence": round(persistence, 4),
            "unconditional_vol": round(float(uncond_vol_annual), 4),
            "half_life_days": round(float(half_life), 1) if half_life != float("inf") else 9999.0,
            "fallback_used": r["fallback_used"],
        })

    return params
