import React, { useState, useRef, useEffect } from 'react';
import { TickerManager } from '../components/TickerManager';
import { SettingsPanel } from '../components/SettingsPanel';
import { ResultsTable } from '../components/ResultsTable';
import { ErrorPanel } from '../components/ErrorPanel';
import { SimulationPanel } from '../components/SimulationPanel';
import { ExportButton } from '../components/ExportButton';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import { calculatePortfolio, fetchCorrelation } from '../api/portfolioApi';
import { exportToPdf } from '../utils/exportPdf';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import type { TickerResult, FailedTicker, CorrelationData } from '../types/portfolio';

export default function PortfolioPage() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [allocation, setAllocation] = useState(5000);
  const [lookback, setLookback] = useState(63);
  const [results, setResults] = useState<TickerResult[]>([]);
  const [liveCorrelation, setLiveCorrelation] = useState<CorrelationData | null>(null);
  const [failed, setFailed] = useState<FailedTicker[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Live heatmap: debounced fetch on ticker/lookback change so the grid builds
  // up as the user adds each ticker, before Calculate is pressed.
  const tickerKey = tickers.join('|');
  const debouncedKey = useDebouncedValue(tickerKey, 400);
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

  async function handleCalculate() {
    if (tickers.length === 0) return;
    setLoading(true);
    setFetchError(null);
    setFailed([]);
    try {
      const res = await calculatePortfolio({ tickers, lookback_days: lookback, total_allocation: allocation });
      setResults(res.results);
      if (res.correlation) setLiveCorrelation(res.correlation);
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

      {liveCorrelation && liveCorrelation.tickers.length >= 1 && (
        <section className="heatmap-section">
          <CorrelationHeatmap data={liveCorrelation} />
        </section>
      )}

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
      ) : !loading && !liveCorrelation && (
        <div className="empty-results">
          <p className="empty-results-text">
            Add tickers and calculate to see risk parity allocations
          </p>
        </div>
      )}
    </>
  );
}
