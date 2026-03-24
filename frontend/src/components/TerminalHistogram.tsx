import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import type { HistogramBin } from '../types/portfolio';

interface Props {
  data: HistogramBin[];
  totalAllocation: number;
}

function formatDollar(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

interface TooltipPayloadEntry {
  payload: HistogramBin;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload?.[0]) return null;
  const bin = payload[0].payload;
  return (
    <div className="fan-tooltip">
      <div className="fan-tooltip-header">{formatDollar(bin.bin_start)} – {formatDollar(bin.bin_end)}</div>
      <div className="fan-tooltip-row"><span>Count</span><span>{bin.count.toLocaleString()}</span></div>
    </div>
  );
}

export function TerminalHistogram({ data, totalAllocation }: Props) {
  const labeled = data.map(bin => ({
    ...bin,
    midpoint: (bin.bin_start + bin.bin_end) / 2,
  }));

  return (
    <div className="histogram-container">
      <h3>Terminal Value Distribution</h3>
      <p className="chart-subtitle">Distribution of portfolio value at horizon end</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={labeled} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0dcd5" vertical={false} />
          <XAxis
            dataKey="midpoint"
            tickFormatter={(v: number) => formatDollar(v)}
            tick={{ fontSize: 10, fill: '#8a8279' }}
            stroke="#d4d0c8"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#8a8279' }}
            stroke="#d4d0c8"
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            x={totalAllocation}
            stroke="#8a8279"
            strokeDasharray="6 4"
            strokeWidth={1}
            label={{ value: 'Break-even', position: 'top', fill: '#8a8279', fontSize: 10 }}
          />
          <Bar dataKey="count" isAnimationActive={false} radius={[1, 1, 0, 0]}>
            {labeled.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.midpoint < totalAllocation ? 'rgba(192, 57, 43, 0.35)' : 'rgba(139, 115, 85, 0.55)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
