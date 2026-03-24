import React, { useState } from 'react';
import type { GarchParams } from '../types/portfolio';

interface Props {
  params: GarchParams[];
}

export function GarchTable({ params }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="garch-section">
      <button
        className="garch-toggle"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {open ? 'Hide' : 'Show'} GARCH Parameters
      </button>
      {open && (
        <div className="table-wrapper">
          <table className="garch-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Ticker</th>
                <th>Persistence</th>
                <th>Half-Life</th>
                <th>Tail (df)</th>
                <th>Uncond. Vol</th>
                <th>Fallback</th>
              </tr>
            </thead>
            <tbody>
              {params.map(p => (
                <tr key={p.ticker}>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{p.ticker}</td>
                  <td className={p.persistence > 0.99 ? 'warn-val' : ''}>
                    {p.persistence.toFixed(4)}
                  </td>
                  <td>{p.half_life_days >= 9999 ? '—' : `${p.half_life_days.toFixed(0)}d`}</td>
                  <td className={p.nu < 4 ? 'warn-val' : ''}>
                    {p.nu.toFixed(1)}
                  </td>
                  <td>{p.persistence >= 0.99 ? '—*' : `${(p.unconditional_vol * 100).toFixed(1)}%`}</td>
                  <td>{p.fallback_used ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
