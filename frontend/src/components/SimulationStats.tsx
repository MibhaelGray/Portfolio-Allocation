import React from 'react';
import type { SimulationSummary } from '../types/portfolio';

interface Props {
  summary: SimulationSummary;
  totalAllocation: number;
  horizonDays: number;
}

function pctToDollar(pct: number, base: number): string {
  const value = base * (pct / 100);
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`;
}

function fmtPct(value: number, sign = false): string {
  const prefix = sign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

export function SimulationStats({ summary, totalAllocation, horizonDays }: Props) {
  const months = Math.round(horizonDays / 21);

  const stats = [
    { label: 'Expected Return', value: fmtPct(summary.mean_return_pct, true), sub: pctToDollar(summary.mean_return_pct, totalAllocation) },
    { label: 'Median Return', value: fmtPct(summary.median_return_pct, true), sub: pctToDollar(summary.median_return_pct, totalAllocation) },
    { label: 'Annualized Vol', value: fmtPct(summary.annualized_vol_pct), sub: null },
    { label: `VaR (5%)`, value: fmtPct(summary.var_5_pct, true), sub: pctToDollar(summary.var_5_pct, totalAllocation) },
    { label: 'CVaR (5%)', value: fmtPct(summary.cvar_5_pct, true), sub: pctToDollar(summary.cvar_5_pct, totalAllocation) },
    { label: 'Prob. of Loss', value: fmtPct(summary.probability_of_loss_pct), sub: null },
    { label: 'Best Case (95th)', value: fmtPct(summary.best_case_pct, true), sub: pctToDollar(summary.best_case_pct, totalAllocation) },
    { label: 'Worst Case (5th)', value: fmtPct(summary.worst_case_pct, true), sub: pctToDollar(summary.worst_case_pct, totalAllocation) },
    { label: 'Med. Max Drawdown', value: fmtPct(summary.median_max_drawdown_pct), sub: null },
  ];

  return (
    <div className="sim-stats">
      <h3>Risk Summary <span className="chart-subtitle">{months}-month horizon</span></h3>
      <div className="stats-grid">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            {s.sub && <div className="stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
