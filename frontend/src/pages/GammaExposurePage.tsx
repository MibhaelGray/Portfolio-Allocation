import React, { useEffect, useState, useCallback } from 'react';
import { fetchGexSnapshot } from '../api/portfolioApi';
import type { GexSnapshotResponse, GexTickerPoint } from '../types/portfolio';

function formatGexDollars(x: number): string {
  const abs = Math.abs(x);
  const sign = x < 0 ? '−' : '+';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function changeClass(x: number): string {
  if (x > 0) return 'change-up';
  if (x < 0) return 'change-down';
  return 'change-flat';
}

function GexCard({ g }: { g: GexTickerPoint }) {
  const isSuppressing = g.regime === 'vol_suppressing';
  const regimeLabel = isSuppressing ? 'Vol-suppressing' : 'Vol-amplifying';
  const regimeClass = isSuppressing ? 'gex-regime--suppressing' : 'gex-regime--amplifying';
  const flipAvailable = g.zero_gamma_flip != null && g.spot_minus_flip != null;
  return (
    <div className="stat-card gex-card">
      <div className="stat-label">{g.symbol}</div>
      <div className={`stat-value gex-regime ${regimeClass}`}>{regimeLabel}</div>
      <div className={`stat-sub tabular-nums ${changeClass(g.total_gex)}`}>
        {formatGexDollars(g.total_gex)}
      </div>
      {flipAvailable && (
        <div className={`gex-flip tabular-nums ${g.spot_minus_flip! >= 0 ? 'gex-flip--above' : 'gex-flip--below'}`}>
          Flip ${g.zero_gamma_flip!.toFixed(2)} ({g.spot_minus_flip! >= 0 ? '+' : '−'}${Math.abs(g.spot_minus_flip!).toFixed(2)})
        </div>
      )}
      {!flipAvailable && (
        <div className="gex-flip">Flip out of ±10% range</div>
      )}
    </div>
  );
}

function formatAsOf(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function GammaExposurePage() {
  const [gex, setGex] = useState<GexSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchGexSnapshot();
      setGex(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GEX data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <section className="controls macro-header">
        <div>
          <h2>Market Gamma Exposure</h2>
          {gex?.as_of && (
            <span className="muted as-of">As of {formatAsOf(gex.as_of)}</span>
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

      {gex && gex.failed.length > 0 && !error && (
        <div className="error-panel error-panel--soft" role="status">
          <p className="failed-header">
            Couldn't fetch chains for: {gex.failed.join(', ')}.
          </p>
        </div>
      )}

      {gex && gex.tickers.length > 0 && (
        <section className="results">
          <h3>Dealer Gamma Exposure</h3>
          <div className="stats-grid stats-grid--five">
            {gex.tickers.map(g => <GexCard key={g.symbol} g={g} />)}
          </div>
          <p className="spread-note">
            Approximation. Sign and regime are reliable; absolute magnitudes are approximate
            (cannot distinguish dealer-side from customer-side without paid data). Excludes 0DTE,
            includes 1–365 DTE. OI is from yesterday's settlement.
          </p>
        </section>
      )}

      {!gex && !error && (
        <div className="empty-results">
          {loading ? 'Loading gamma exposure data…' : 'No data yet.'}
        </div>
      )}
    </>
  );
}
