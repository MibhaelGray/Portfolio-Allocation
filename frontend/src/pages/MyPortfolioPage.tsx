import React, { useState, useRef, useEffect } from 'react';
import { simulatePortfolio, fetchCorrelation } from '../api/portfolioApi';
import { HoldingsEditor, type Holding } from '../components/HoldingsEditor';
import { CsvImportModal } from '../components/CsvImportModal';
import { FanChart } from '../components/FanChart';
import { TerminalHistogram } from '../components/TerminalHistogram';
import { SimulationStats } from '../components/SimulationStats';
import { GarchTable } from '../components/GarchTable';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import { ExportButton } from '../components/ExportButton';
import { exportToPdf } from '../utils/exportPdf';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import type { SimulateResponse, CorrelationData } from '../types/portfolio';

const HORIZON_OPTIONS = [
  { label: '6 months', value: 126 },
  { label: '9 months', value: 189 },
  { label: '1 year', value: 252 },
];

const SIM_COUNT_OPTIONS = [1000, 5000, 10000, 25000];

function makeId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

const LOOKBACK_OPTIONS = [
  { label: '1 month',   days: 21  },
  { label: '2 months',  days: 42  },
  { label: '3 months',  days: 63  },
  { label: '6 months',  days: 126 },
  { label: '9 months',  days: 189 },
  { label: '1 year',    days: 252 },
  { label: '2 years',   days: 504 },
];

const PRESET_DAYS = new Set(LOOKBACK_OPTIONS.map(o => o.days));

export default function MyPortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [lookback, setLookback] = useState(63);
  const [customLookback, setCustomLookback] = useState(false);
  const [horizon, setHorizon] = useState(126);
  const [numSims, setNumSims] = useState(5000);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [liveCorrelation, setLiveCorrelation] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validHoldings = holdings.filter(
    h => h.ticker.trim() && parseFloat(h.amount) > 0
  );
  const total = validHoldings.reduce((s, h) => s + parseFloat(h.amount), 0);

  const tickers = validHoldings.map(h => h.ticker.trim());
  const hasDuplicates = new Set(tickers).size !== tickers.length;
  const canSubmit = validHoldings.length >= 1 && total > 0 && !hasDuplicates && !loading;
  const resultsRef = useRef<HTMLDivElement>(null);

  // Live heatmap: fire on any non-empty ticker input (amount not required for
  // correlation). Dedupe and drop blanks before hashing so in-progress typing
  // doesn't thrash the endpoint.
  const liveTickers = Array.from(new Set(
    holdings.map(h => h.ticker.trim().toUpperCase()).filter(t => t.length > 0)
  ));
  const liveKey = liveTickers.join('|');
  const debouncedKey = useDebouncedValue(liveKey, 400);
  const debouncedLookback = useDebouncedValue(lookback, 400);

  useEffect(() => {
    if (!debouncedKey) {
      setLiveCorrelation(null);
      return;
    }
    const tks = debouncedKey.split('|');
    const controller = new AbortController();
    fetchCorrelation({ tickers: tks, lookback_days: debouncedLookback }, controller.signal)
      .then(res => setLiveCorrelation(res.correlation))
      .catch(err => {
        if (err?.name !== 'AbortError') setLiveCorrelation(null);
      });
    return () => controller.abort();
  }, [debouncedKey, debouncedLookback]);

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
        </div>

        <div
          className="csv-import-zone"
          onClick={() => setImportOpen(true)}
        >
          <p className="import-zone-text">Import from CSV</p>
          <p className="import-zone-hint">Drag a broker export here or click to upload</p>
        </div>

        <CsvImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={setHoldings}
        />

        <div className="holdings-divider">
          <span>or enter manually</span>
        </div>

        <HoldingsEditor holdings={holdings} onChange={setHoldings} />

        <div className="simulation-controls">
          <label>
            <span className="control-label">Lookback</span>
            {customLookback ? (
              <div className="lookback-custom">
                <input
                  type="number"
                  min={5}
                  max={504}
                  value={lookback}
                  onChange={e => setLookback(Number(e.target.value))}
                  placeholder="Trading days"
                />
                <button
                  type="button"
                  className="lookback-toggle"
                  onClick={() => { setCustomLookback(false); setLookback(63); }}
                >
                  Presets
                </button>
              </div>
            ) : (
              <div className="lookback-custom">
                <select value={lookback} onChange={e => {
                  if (e.target.value === 'custom') {
                    setCustomLookback(true);
                  } else {
                    setLookback(Number(e.target.value));
                  }
                }}>
                  {LOOKBACK_OPTIONS.map(o => (
                    <option key={o.days} value={o.days}>{o.label}</option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
              </div>
            )}
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

      {liveCorrelation && liveCorrelation.tickers.length >= 1 && (
        <section className="heatmap-section">
          <CorrelationHeatmap data={liveCorrelation} />
        </section>
      )}

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

      {simResult ? (
        <section className="simulation-results" ref={resultsRef}>
          <div className="results-header">
            <h2>Simulation Results</h2>
            <ExportButton onExport={async () => {
              if (!resultsRef.current) return;
              const sections = resultsRef.current.querySelectorAll<HTMLElement>(
                '.sim-stats, .fan-chart-container, .histogram-container'
              );
              await exportToPdf({
                title: 'Portfolio Simulation Report',
                subtitle: `${validHoldings.length} holdings · $${total.toLocaleString()}`,
                metadata: [
                  { label: 'Lookback', value: `${lookback} days` },
                  { label: 'Horizon', value: `${horizon} days` },
                  { label: 'Simulations', value: numSims.toLocaleString() },
                ],
                filename: 'portfolio-simulation.pdf',
                sections: Array.from(sections),
              });
            }} />
          </div>
          <SimulationStats
            summary={simResult.summary}
            totalAllocation={total}
            horizonDays={simResult.horizon_days}
          />
          <FanChart data={simResult.fan_chart} totalAllocation={total} />
          <TerminalHistogram data={simResult.histogram} totalAllocation={total} />
          <GarchTable params={simResult.garch_params} />
        </section>
      ) : !loading && validHoldings.length > 0 && (
        <div className="empty-results">
          <p className="empty-results-text">
            Run simulation to see risk projections for your portfolio
          </p>
        </div>
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
