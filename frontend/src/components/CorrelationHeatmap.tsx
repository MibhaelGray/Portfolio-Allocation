import React, { useMemo, useState } from 'react';
import type { CorrelationData } from '../types/portfolio';

interface Props {
  data: CorrelationData;
}

// Diverging palette anchored in the app's editorial neutrals.
// Negative → cool slate, zero → cream, positive → warm sepia.
const NEG = [0x4a, 0x58, 0x62]; // #4a5862 slate
const MID = [0xf5, 0xf2, 0xeb]; // #f5f2eb cream near background
const POS = [0x6b, 0x44, 0x23]; // #6b4423 deep sepia

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: number[], b: number[], t: number): string {
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function colorFor(rho: number): string {
  // Clamp for safety, then linear interp on each side of zero.
  const r = Math.max(-1, Math.min(1, rho));
  if (r >= 0) return lerpRgb(MID, POS, r);
  return lerpRgb(MID, NEG, -r);
}

// Rough luminance check — decide whether in-cell text should be cream or ink.
function textOn(rho: number): string {
  const r = Math.max(-1, Math.min(1, rho));
  // Strong correlations → dark fill → use cream text. Weak → dark ink.
  return Math.abs(r) > 0.65 ? '#f5f2eb' : '#2a241e';
}

interface Cell {
  row: number;
  col: number;
  rho: number;
}

export function CorrelationHeatmap({ data }: Props) {
  const { tickers, matrix } = data;
  const n = tickers.length;
  const [hover, setHover] = useState<Cell | null>(null);

  // Sizing. Cells shrink for larger portfolios so the whole thing fits.
  const cellSize = n <= 6 ? 56 : n <= 8 ? 48 : n <= 12 ? 38 : n <= 16 ? 32 : 26;
  const gap = 2;
  const labelPad = 68; // room for row labels on the left
  const labelGap = 8; // between grid and column labels
  const labelBottom = 28; // column label row height

  const gridSize = n * cellSize + (n - 1) * gap;
  const gridTop = 12; // small breathing room at the top
  const svgWidth = labelPad + gridSize + 16;
  const svgHeight = gridTop + gridSize + labelGap + labelBottom;

  // Pre-compute cells (lower triangle + diagonal only).
  const cells = useMemo(() => {
    const out: Cell[] = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col <= row; col++) {
        out.push({ row, col, rho: matrix[row][col] });
      }
    }
    return out;
  }, [matrix, n]);

  // Legend samples.
  const legendStops = [-1, -0.5, 0, 0.5, 1];

  const hoverPair =
    hover != null
      ? { a: tickers[hover.row], b: tickers[hover.col], rho: hover.rho }
      : null;

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <h3>Correlation structure</h3>
        <p className="heatmap-subtitle">
          Ordered by hierarchical clustering. Adjacent tickers are the most similar;
          visible blocks of darker cells reveal correlated groups.
        </p>
      </div>

      <div className="heatmap-grid-wrap">
        <svg
          width={svgWidth}
          height={svgHeight}
          role="img"
          aria-label="Correlation heatmap"
        >
          {/* Row labels — right-aligned, to the left of each row. */}
          {tickers.map((t, i) => (
            <text
              key={`rl-${t}-${i}`}
              x={labelPad - 12}
              y={gridTop + i * (cellSize + gap) + cellSize / 2}
              textAnchor="end"
              dominantBaseline="central"
              className={
                'heatmap-label' + (hover?.row === i || hover?.col === i ? ' is-active' : '')
              }
            >
              {t}
            </text>
          ))}

          {/* Column labels — centered under each column. */}
          {tickers.map((t, i) => (
            <text
              key={`cl-${t}-${i}`}
              x={labelPad + i * (cellSize + gap) + cellSize / 2}
              y={gridTop + gridSize + labelGap + 10}
              textAnchor="middle"
              dominantBaseline="hanging"
              className={
                'heatmap-label' + (hover?.row === i || hover?.col === i ? ' is-active' : '')
              }
            >
              {t}
            </text>
          ))}

          {/* Cells. */}
          {cells.map(({ row, col, rho }) => {
            const x = labelPad + col * (cellSize + gap);
            const y = gridTop + row * (cellSize + gap);
            const isDiag = row === col;
            const showLabel = !isDiag && Math.abs(rho) > 0.5 && cellSize >= 32;
            return (
              <g
                key={`c-${row}-${col}`}
                onMouseEnter={() => setHover({ row, col, rho })}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  fill={isDiag ? '#ece7dc' : colorFor(rho)}
                  rx={2}
                  ry={2}
                  className="heatmap-cell"
                />
                {showLabel && (
                  <text
                    x={x + cellSize / 2}
                    y={y + cellSize / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="heatmap-cell-label"
                    fill={textOn(rho)}
                  >
                    {rho > 0 ? '+' : ''}
                    {rho.toFixed(2).replace(/^-?0\./, rho < 0 ? '-.' : '.')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover readout. Fixed-height so the layout doesn't jump. */}
      <div className="heatmap-readout">
        {hoverPair ? (
          hoverPair.a === hoverPair.b ? (
            <span>
              <strong>{hoverPair.a}</strong>
            </span>
          ) : (
            <span>
              <strong>{hoverPair.a}</strong> &middot; <strong>{hoverPair.b}</strong>
              <span className="heatmap-readout-rho">
                &rho; = {hoverPair.rho >= 0 ? '+' : ''}
                {hoverPair.rho.toFixed(3)}
              </span>
            </span>
          )
        ) : (
          <span className="heatmap-readout-hint">Hover any cell for details</span>
        )}
      </div>

      {/* Legend. */}
      <div className="heatmap-legend">
        <div className="heatmap-legend-bar" />
        <div className="heatmap-legend-stops">
          {legendStops.map((s) => (
            <span key={s}>
              {s > 0 ? '+' : ''}
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
