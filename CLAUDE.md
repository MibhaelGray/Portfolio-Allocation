# Portfolio Allocation

Risk parity position sizing tool. Enter stock tickers, get correlation-aware, risk-balanced dollar allocations.

## Architecture

- **Backend**: Python FastAPI (`backend/`) — batch-fetches prices via yfinance, computes covariance matrix, runs risk parity optimization (scipy), returns weighted positions
- **Frontend**: Vite + React + TypeScript (`frontend/`) — editorial-style UI with EB Garamond / Inter fonts, cream background

## Key Files

### Backend
- `backend/main.py` — FastAPI app, CORS, POST `/api/calculate`, POST `/api/simulate`, GET `/health`
- `backend/calculator.py` — batch yfinance download, covariance matrix, risk parity optimizer (scipy SLSQP), risk contributions, currency detection via `fast_info`
- `backend/simulator.py` — GARCH(1,1)-t model fitting (parallel via ThreadPoolExecutor), Cholesky-correlated Monte Carlo simulation, fan chart percentiles, terminal histogram, VaR/CVaR/drawdown stats
- `backend/models.py` — Pydantic v2 models (CalculateRequest, TickerResult with `currency` and `risk_contribution` fields, FailedTicker, CalculateResponse, SimulateRequest/Response)

### Frontend
- `frontend/src/App.tsx` — Router with nav (Calculator / Methodology)
- `frontend/src/pages/PortfolioPage.tsx` — Main calculator: ticker management, settings, results table
- `frontend/src/pages/MethodologyPage.tsx` — Editorial explainer (log returns, realized vol, covariance matrix, risk parity weighting, position sizing, limitations)
- `frontend/src/components/ResultsTable.tsx` — Sortable table via @tanstack/react-table, currency-aware formatting
- `frontend/src/components/TickerManager.tsx` — Add/remove ticker chips
- `frontend/src/components/SettingsPanel.tsx` — Allocation amount + lookback days inputs
- `frontend/src/components/SimulationPanel.tsx` — Monte Carlo simulation trigger and results container
- `frontend/src/components/FanChart.tsx` — Recharts fan chart (percentile bands over time)
- `frontend/src/components/SimulationStats.tsx` — VaR, CVaR, drawdown, probability of loss stats
- `frontend/src/components/ErrorPanel.tsx` — Error display
- `frontend/src/api/portfolioApi.ts` — Fetch wrapper, relative `/api/calculate` (proxied by Vite)
- `frontend/src/types/portfolio.ts` — TypeScript interfaces
- `frontend/src/App.css` — All styles (editorial light theme)
- `frontend/vite.config.ts` — Proxy `/api` → `http://localhost:8000`

### Infrastructure
- `start_backend.js` — Node.js launcher for Python uvicorn (workaround: macOS TCC sandbox blocks Python from spawning in ~/Documents via preview tool; Node is exempt)
- `.claude/launch.json` — Dev server configs: FastAPI (port 8000 via node launcher), Vite (port 5173 via npm --prefix)

## Dev Server Notes

- **Backend must be started via `start_backend.js`** (not directly with uvicorn) due to macOS sandbox restrictions in Claude's preview tool
- Backend uses `--loop asyncio --http h11` (not uvloop/httptools) for sandbox compatibility
- Frontend uses `npm run dev --prefix /path/to/frontend`
- Vite proxy handles `/api` → backend

## Design

Light editorial aesthetic inspired by The Atlantic. EB Garamond for headings/methodology prose, Inter for UI/data. Cream background (#faf9f6), warm neutrals, minimal borders.

## Financial Logic

- **Log returns**: ln(P_t / P_{t-1})
- **Realized vol**: std dev of log returns over trailing lookback window, annualized by sqrt(252)
- **Covariance matrix**: estimated from aligned log returns of all tickers (batch download), annualized by multiplying by 252. Ridge regularization applied if near-singular (cond > 1e10)
- **Risk parity weights**: optimizer (scipy SLSQP) minimizes Σ(RC_i - 1/N)² where RC_i = w_i × (Σw)_i / (w^T Σ w). Accounts for both individual vol (diagonal) and correlations (off-diagonals). Falls back to inverse-vol if optimization fails
- **Risk contribution**: RC_i = w_i × (Σw)_i / σ²_p — each asset's % contribution to portfolio variance, should be ~1/N
- **Default lookback**: 63 days (half of 6-month intended hold)
- **Currency**: detected from yfinance fast_info, passed through full stack for correct symbol display

## Monte Carlo Simulation

GARCH(1,1) with Student-t innovations per asset, fitted in parallel. Correlated paths via Cholesky decomposition of standardized residual correlation matrix. Variance capped at 10x starting value to prevent explosion. Daily returns clamped to ±25%. Outputs: fan chart (5th–95th percentile bands), terminal value histogram, summary stats (mean/median return, annualized vol, VaR 5%, CVaR 5%, probability of loss, median max drawdown). Endpoint: POST `/api/simulate`.
