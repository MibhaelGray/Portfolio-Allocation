import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { FanChartPoint } from '../types/portfolio';

interface Props {
  data: FanChartPoint[];
  totalAllocation: number;
}

function formatDollar(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function dayLabel(day: number): string {
  if (day === 0) return '0';
  const months = Math.round(day / 21);
  return `${months}mo`;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: number }) {
  if (!active || !payload || label == null) return null;

  const point = payload[0]?.payload as (FanChartPoint & Record<string, number>) | undefined;
  if (!point) return null;

  const months = label / 21;
  const timeLabel = months < 1 ? `${label}d` : `${months.toFixed(1)}mo`;

  return (
    <div className="fan-tooltip">
      <div className="fan-tooltip-header">Day {label} ({timeLabel})</div>
      <div className="fan-tooltip-row"><span>95th</span><span>{formatDollar(point.p95)}</span></div>
      <div className="fan-tooltip-row"><span>90th</span><span>{formatDollar(point.p90)}</span></div>
      <div className="fan-tooltip-row"><span>75th</span><span>{formatDollar(point.p75)}</span></div>
      <div className="fan-tooltip-row" style={{ fontWeight: 600 }}><span>Median</span><span>{formatDollar(point.p50)}</span></div>
      <div className="fan-tooltip-row"><span>25th</span><span>{formatDollar(point.p25)}</span></div>
      <div className="fan-tooltip-row"><span>10th</span><span>{formatDollar(point.p10)}</span></div>
      <div className="fan-tooltip-row"><span>5th</span><span>{formatDollar(point.p5)}</span></div>
    </div>
  );
}

// Transform raw percentile data into stacked band deltas.
// Each band is the height (difference) between two percentile lines,
// stacked from bottom (p5) to top (p95).
interface BandDatum extends FanChartPoint {
  base: number;       // p5 (invisible, positions the stack)
  band_5_10: number;  // p10 - p5
  band_10_25: number; // p25 - p10
  band_25_50: number; // p50 - p25
  band_50_75: number; // p75 - p50
  band_75_90: number; // p90 - p75
  band_90_95: number; // p95 - p90
}

export function FanChart({ data, totalAllocation }: Props) {
  const horizonDays = data.length - 1;

  // Generate month-boundary ticks: 0, 21, 42, 63, ...
  const ticks = useMemo(() => {
    const t: number[] = [0];
    let day = 21;
    while (day <= horizonDays) {
      t.push(day);
      day += 21;
    }
    if (t[t.length - 1] !== horizonDays) t.push(horizonDays);
    return t;
  }, [horizonDays]);

  // Sample data for performance on long horizons
  const sampled = useMemo(() => {
    if (data.length <= 200) return data;
    const step = Math.ceil(data.length / 150);
    return data.filter((_, i) => i === 0 || i === data.length - 1 || i % step === 0);
  }, [data]);

  // Transform to stacked band deltas
  const bandData: BandDatum[] = useMemo(() =>
    sampled.map(d => ({
      ...d,
      base: d.p5,
      band_5_10: d.p10 - d.p5,
      band_10_25: d.p25 - d.p10,
      band_25_50: d.p50 - d.p25,
      band_50_75: d.p75 - d.p50,
      band_75_90: d.p90 - d.p75,
      band_90_95: d.p95 - d.p90,
    })),
  [sampled]);

  return (
    <div className="fan-chart-container">
      <h3>Portfolio Value Fan Chart</h3>
      <p className="chart-subtitle">Percentile bands from {horizonDays}-day GARCH-t simulation</p>
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={bandData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0dcd5" />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, horizonDays]}
            ticks={ticks}
            tickFormatter={dayLabel}
            tick={{ fontSize: 11, fill: '#8a8279' }}
            stroke="#d4d0c8"
          />
          <YAxis
            tickFormatter={(v: number) => formatDollar(v)}
            tick={{ fontSize: 11, fill: '#8a8279' }}
            stroke="#d4d0c8"
            width={75}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={totalAllocation}
            stroke="#8a8279"
            strokeDasharray="6 4"
            strokeWidth={1}
            label={{ value: 'Initial', position: 'right', fill: '#8a8279', fontSize: 11 }}
          />

          {/* Invisible base: positions the stack at p5 */}
          <Area
            type="monotone" dataKey="base" stackId="fan"
            stroke="none" fill="transparent"
            isAnimationActive={false}
          />

          {/* 5–10 band (outermost lower) */}
          <Area
            type="monotone" dataKey="band_5_10" stackId="fan"
            stroke="none" fill="#ddd5c5" fillOpacity={0.45}
            isAnimationActive={false}
          />

          {/* 10–25 band */}
          <Area
            type="monotone" dataKey="band_10_25" stackId="fan"
            stroke="none" fill="#d0c5ae" fillOpacity={0.5}
            isAnimationActive={false}
          />

          {/* 25–50 band (inner lower) */}
          <Area
            type="monotone" dataKey="band_25_50" stackId="fan"
            stroke="none" fill="#c0b393" fillOpacity={0.55}
            isAnimationActive={false}
          />

          {/* 50–75 band (inner upper) */}
          <Area
            type="monotone" dataKey="band_50_75" stackId="fan"
            stroke="none" fill="#c0b393" fillOpacity={0.55}
            isAnimationActive={false}
          />

          {/* 75–90 band */}
          <Area
            type="monotone" dataKey="band_75_90" stackId="fan"
            stroke="none" fill="#d0c5ae" fillOpacity={0.5}
            isAnimationActive={false}
          />

          {/* 90–95 band (outermost upper) */}
          <Area
            type="monotone" dataKey="band_90_95" stackId="fan"
            stroke="none" fill="#ddd5c5" fillOpacity={0.45}
            isAnimationActive={false}
          />

          {/* Median line on top */}
          <Area
            type="monotone" dataKey="p50"
            stroke="#8b7355" strokeWidth={2}
            fill="none"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
