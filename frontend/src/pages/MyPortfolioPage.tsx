import React, { useState } from 'react';
import { simulatePortfolio } from '../api/portfolioApi';
import { HoldingsEditor, type Holding } from '../components/HoldingsEditor';
import { FanChart } from '../components/FanChart';
import { TerminalHistogram } from '../components/TerminalHistogram';
import { SimulationStats } from '../components/SimulationStats';
import { GarchTable } from '../components/GarchTable';
import type { SimulateResponse } from '../types/portfolio';

const HORIZON_OPTIONS = [
  { label: '6 months', value: 126 },
  { label: '9 months', value: 189 },
  { label: '1 year', value: 252 },
];

const SIM_COUNT_OPTIONS = [1000, 5000, 10000, 25000];

function makeId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

export default function MyPortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([
    { id: makeId(), ticker: '', amount: '' },
    { id: makeId(), ticker: '', amount: '' },
  ]);
  const [lookback, setLookback] = useState(63);
  const [horizon, setHorizon] = useState(126);
  const [numSims, setNumSims] = useState(5000);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validHoldings = holdings.filter(
    h => h.ticker.trim() && parseFloat(h.amount) > 0
  );
  const total = validHoldings.reduce((s, h) => s + parseFloat(h.amount), 0);

  const tickers = validHoldings.map(h => h.ticker.trim());
  const hasDuplicates = new Set(tickers).size !== tickers.length;
  const canSubmit = validHoldings.length >= 1 && total > 0 && !hasDuplicates && !loading;

  async function handleSimulate() {
    setLoading(true);
    setError(null);
    try {
      const weights = validHoldings.map(h => parseFloat(h.amount) / total);
      const res = await simulatePortfolio({
        tickers,
        weights,
        lookback_days: lookback,
        total_allocation: total,
        horizon_days: horizon,
        num_simulations: numSims,
      });
      setSimResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSimResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="controls">
        <div className="my-portfolio-intro">
          <h2>My Portfolio</h2>
          <p className="page-lede">
            Enter your holdings below to run a Monte Carlo simulation on your actual portfolio.
          </p>
        </div>

        <HoldingsEditor holdings={holdings} onChange={setHoldings} />

        <div className="simulation-controls">
          <label>
            <span className="control-label">Lookback</span>
            <select value={lookback} onChange={e => setLookback(Number(e.target.value))}>
              <option value={63}>63 days</option>
              <option value={126}>126 days</option>
              <option value={252}>252 days</option>
            </select>
          </label>

          <label>
            <span className="control-label">Horizon</span>
            <select value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
              {HORIZON_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="control-label">Simulations</span>
            <select value={numSims} onChange={e => setNumSims(Number(e.target.value))}>
              {SIM_COUNT_OPTIONS.map(n => (
                <option key={n} value={n}>{n.toLocaleString()}</option>
              ))}
            </select>
          </label>

          <button
            className="simulate-btn"
            onClick={handleSimulate}
            disabled={!canSubmit}
          >
            {loading ? 'Simulating...' : 'Run Simulation'}
          </button>
        </div>
      </section>

      {loading && (
        <p className="sim-loading">
          Fitting GARCH models and running {numSims.toLocaleString()} paths — this may take 10–20 seconds.
        </p>
      )}

      {error && (
        <div className="error-panel">
          <p className="fetch-error">{error}</p>
        </div>
      )}

      {simResult && (
        <section className="simulation-results">
          <SimulationStats
            summary={simResult.summary}
            totalAllocation={total}
            horizonDays={simResult.horizon_days}
          />
          <FanChart data={simResult.fan_chart} totalAllocation={total} />
          <TerminalHistogram data={simResult.histogram} totalAllocation={total} />
          <GarchTable params={simResult.garch_params} />
        </section>
      )}

      {simResult?.failed && simResult.failed.length > 0 && (
        <div className="error-panel" style={{ marginTop: '1rem' }}>
          <p className="failed-header">Some tickers could not be processed:</p>
          <ul>
            {simResult.failed.map(f => (
              <li key={f.ticker}>{f.ticker}: {f.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
