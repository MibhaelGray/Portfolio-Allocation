import React, { useState, useRef } from 'react';
import { TickerManager } from '../components/TickerManager';
import { SettingsPanel } from '../components/SettingsPanel';
import { ResultsTable } from '../components/ResultsTable';
import { ErrorPanel } from '../components/ErrorPanel';
import { SimulationPanel } from '../components/SimulationPanel';
import { ExportButton } from '../components/ExportButton';
import { calculatePortfolio } from '../api/portfolioApi';
import { exportToPdf } from '../utils/exportPdf';
import type { TickerResult, FailedTicker } from '../types/portfolio';

export default function PortfolioPage() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [allocation, setAllocation] = useState(5000);
  const [lookback, setLookback] = useState(63);
  const [results, setResults] = useState<TickerResult[]>([]);
  const [failed, setFailed] = useState<FailedTicker[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function handleCalculate() {
    if (tickers.length === 0) return;
    setLoading(true);
    setFetchError(null);
    setFailed([]);
    try {
      const res = await calculatePortfolio({ tickers, lookback_days: lookback, total_allocation: allocation });
      setResults(res.results);
      setFailed(res.failed);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const total = results.reduce((s, r) => s + r.position, 0);

  return (
    <>
      <section className="controls">
        <TickerManager tickers={tickers} onChange={setTickers} />
        <SettingsPanel
          allocation={allocation}
          lookback={lookback}
          onAllocationChange={setAllocation}
          onLookbackChange={setLookback}
        />
        <button
          className="calculate-btn"
          onClick={handleCalculate}
          disabled={loading || tickers.length === 0}
        >
          {loading ? 'Calculating...' : results.length > 0 ? 'Recalculate' : 'Calculate'}
        </button>
      </section>

      <ErrorPanel failed={failed} fetchError={fetchError} />

      {results.length > 0 ? (
        <div ref={resultsRef}>
          <section className="results">
            <div className="results-header">
              <h2>Results</h2>
              <span className="summary">
                {results.length} positions &nbsp;·&nbsp; Total:{' '}
                {total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
              <ExportButton onExport={async () => {
                if (!resultsRef.current) return;
                const sections = resultsRef.current.querySelectorAll<HTMLElement>(
                  '.results, .sim-stats, .fan-chart-container, .histogram-container'
                );
                await exportToPdf({
                  title: 'Risk Parity Allocation',
                  subtitle: `${results.length} positions · ${total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
                  metadata: [
                    { label: 'Allocation', value: `$${allocation.toLocaleString()}` },
                    { label: 'Lookback', value: `${lookback} days` },
                  ],
                  filename: 'risk-parity-allocation.pdf',
                  sections: Array.from(sections),
                });
              }} />
            </div>
            <ResultsTable data={results} />
          </section>
          <SimulationPanel
            results={results}
            allocation={allocation}
            lookback={lookback}
          />
        </div>
      ) : !loading && (
        <div className="empty-results">
          <p className="empty-results-text">
            Add tickers and calculate to see risk parity allocations
          </p>
        </div>
      )}
    </>
  );
}
