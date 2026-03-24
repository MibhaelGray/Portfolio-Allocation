import React, { useState } from 'react';
import { simulatePortfolio } from '../api/portfolioApi';
import { FanChart } from './FanChart';
import { TerminalHistogram } from './TerminalHistogram';
import { SimulationStats } from './SimulationStats';
import { GarchTable } from './GarchTable';
import type { TickerResult, SimulateResponse } from '../types/portfolio';

interface Props {
  results: TickerResult[];
  allocation: number;
  lookback: number;
}

const HORIZON_OPTIONS = [
  { label: '6 months', value: 126 },
  { label: '9 months', value: 189 },
  { label: '1 year', value: 252 },
];

const SIM_COUNT_OPTIONS = [1000, 5000, 10000, 25000];

export function SimulationPanel({ results, allocation, lookback }: Props) {
  const [horizon, setHorizon] = useState(126);
  const [numSims, setNumSims] = useState(5000);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimulate() {
    setLoading(true);
    setError(null);
    try {
      const res = await simulatePortfolio({
        tickers: results.map(r => r.ticker),
        weights: results.map(r => r.weight),
        lookback_days: lookback,
        total_allocation: allocation,
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
    <section className="simulation-section">
      <div className="simulation-header">
        <h2>Monte Carlo Simulation</h2>
      </div>

      <div className="simulation-controls">
        <label>
          <span className="control-label">Horizon</span>
          <select
            value={horizon}
            onChange={e => { setHorizon(Number(e.target.value)); setSimResult(null); }}
          >
            {HORIZON_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="control-label">Simulations</span>
          <select
            value={numSims}
            onChange={e => { setNumSims(Number(e.target.value)); setSimResult(null); }}
          >
            {SIM_COUNT_OPTIONS.map(n => (
              <option key={n} value={n}>{n.toLocaleString()}</option>
            ))}
          </select>
        </label>

        <button
          className="simulate-btn"
          onClick={handleSimulate}
          disabled={loading}
        >
          {loading ? 'Simulating...' : 'Run Simulation'}
        </button>
      </div>

      {loading && (
        <p className="sim-loading">Fitting GARCH models and running {numSims.toLocaleString()} paths — this may take 10–20 seconds.</p>
      )}

      {error && (
        <div className="error-panel" style={{ marginTop: '1rem' }}>
          <p className="fetch-error">{error}</p>
        </div>
      )}

      {simResult && (
        <div className="simulation-results">
          <SimulationStats
            summary={simResult.summary}
            totalAllocation={allocation}
            horizonDays={simResult.horizon_days}
          />
          <FanChart data={simResult.fan_chart} totalAllocation={allocation} />
          <TerminalHistogram data={simResult.histogram} totalAllocation={allocation} />
          <GarchTable params={simResult.garch_params} />
        </div>
      )}
    </section>
  );
}
