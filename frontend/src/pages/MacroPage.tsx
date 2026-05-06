import React, { useEffect, useState, useCallback } from 'react';
import { fetchYieldSnapshot, fetchYieldHistory } from '../api/portfolioApi';
import { YieldCurveChart } from '../components/YieldCurveChart';
import type {
  YieldSnapshotResponse, YieldHistoryResponse, YieldPoint, SpreadPoint,
} from '../types/portfolio';

function formatBpsChange(bps: number): string {
  if (bps === 0) return '0.0 bps';
  const sign = bps > 0 ? '+' : '−';
  return `${sign}${Math.abs(bps).toFixed(1)} bps`;
}

function formatBpsValue(bps: number): string {
  const sign = bps < 0 ? '−' : '';
  return `${sign}${Math.abs(bps).toFixed(0)} bps`;
}

function changeClass(bps: number): string {
  if (bps > 0) return 'change-up';
  if (bps < 0) return 'change-down';
  return 'change-flat';
}

function YieldCard({ y }: { y: YieldPoint }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{y.tenor}</div>
      <div className="stat-value tabular-nums">{y.yield_pct.toFixed(2)}%</div>
      <div className={`stat-sub tabular-nums ${changeClass(y.change_bps)}`}>
        {formatBpsChange(y.change_bps)}
      </div>
    </div>
  );
}

function SpreadCard({ s }: { s: SpreadPoint }) {
  return (
    <div className={`stat-card spread-card ${s.inverted ? 'spread-card--inverted' : ''}`}>
      <div className="stat-label">
        {s.name}
        {s.inverted && <span className="inverted-pill">INVERTED</span>}
      </div>
      <div className="stat-value tabular-nums">{formatBpsValue(s.value_bps)}</div>
      <div className={`stat-sub tabular-nums ${changeClass(s.change_bps)}`}>
        {formatBpsChange(s.change_bps)}
      </div>
    </div>
  );
}

function MissingCard({ tenor }: { tenor: string }) {
  return (
    <div className="stat-card stat-card--missing">
      <div className="stat-label">{tenor}</div>
      <div className="stat-value tabular-nums">—</div>
      <div className="stat-sub">Unavailable</div>
    </div>
  );
}

export default function MacroPage() {
  const [snapshot, setSnapshot] = useState<YieldSnapshotResponse | null>(null);
  const [history, setHistory] = useState<YieldHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snap, hist] = await Promise.all([
        fetchYieldSnapshot(),
        fetchYieldHistory(252),
      ]);
      setSnapshot(snap);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load yield data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const presentTenors = new Set((snapshot?.yields ?? []).map(y => y.tenor));
  const allTenors = ['3M', '2Y', '5Y', '10Y', '30Y'];
  const failedTenors = snapshot?.failed ?? [];

  return (
    <>
      <section className="controls macro-header">
        <div>
          <h2>Treasury Yields</h2>
          {snapshot?.as_of && (
            <span className="muted as-of">As of {snapshot.as_of}</span>
          )}
        </div>
        <button
          className="calculate-btn"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>

      {error && (
        <div className="error-panel" role="alert">
          <p className="fetch-error">Request failed: {error}</p>
        </div>
      )}

      {failedTenors.length > 0 && !error && (
        <div className="error-panel error-panel--soft" role="status">
          <p className="failed-header">
            Some tenors couldn't be fetched: {failedTenors.join(', ')}.
            Spreads involving these tenors are hidden.
          </p>
        </div>
      )}

      {snapshot && (
        <section className="results">
          <h3>Yields</h3>
          <div className="stats-grid stats-grid--five">
            {allTenors.map(tenor => {
              const y = snapshot.yields.find(yy => yy.tenor === tenor);
              if (y) return <YieldCard key={tenor} y={y} />;
              if (presentTenors.has(tenor)) return null;
              return <MissingCard key={tenor} tenor={tenor} />;
            })}
          </div>
        </section>
      )}

      {snapshot && snapshot.spreads.length > 0 && (
        <section className="results">
          <h3>Spreads</h3>
          <div className="stats-grid">
            {snapshot.spreads.map(s => <SpreadCard key={s.name} s={s} />)}
          </div>
          <p className="spread-note">
            Negative 10Y − 2Y and 10Y − 3M historically precede recessions.
          </p>
        </section>
      )}

      {history && history.dates.length > 0 && (
        <section className="results">
          <h3>Yield Curve History</h3>
          <p className="chart-subtitle">
            Daily closing yields over the last {history.dates.length} trading days
          </p>
          <YieldCurveChart history={history} />
        </section>
      )}

      {!snapshot && !error && (
        <div className="empty-results">
          {loading ? 'Loading yield data…' : 'No data yet.'}
        </div>
      )}
    </>
  );
}
