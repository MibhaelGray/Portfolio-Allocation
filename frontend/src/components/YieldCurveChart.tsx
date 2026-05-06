import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { YieldHistoryResponse } from '../types/portfolio';

interface Props {
  history: YieldHistoryResponse;
}

const TENOR_ORDER = ['3M', '2Y', '5Y', '10Y', '30Y'];

const TENOR_COLORS: Record<string, string> = {
  '3M':  '#d4c5a3',
  '2Y':  '#b8a378',
  '5Y':  '#9c8154',
  '10Y': '#8b7355',
  '30Y': '#5c4a32',
};

interface ChartRow {
  date: string;
  [tenor: string]: number | string | null;
}

export function YieldCurveChart({ history }: Props) {
  const data: ChartRow[] = useMemo(() => {
    if (!history?.dates?.length) return [];
    return history.dates.map((date, i) => {
      const row: ChartRow = { date };
      for (const tenor of TENOR_ORDER) {
        const series = history.series[tenor];
        row[tenor] = series ? series[i] ?? null : null;
      }
      return row;
    });
  }, [history]);

  const ticks = useMemo(() => {
    if (data.length === 0) return [];
    const target = 6;
    const step = Math.max(1, Math.floor(data.length / target));
    const t: string[] = [];
    for (let i = 0; i < data.length; i += step) t.push(data[i].date);
    if (t[t.length - 1] !== data[data.length - 1].date) {
      t.push(data[data.length - 1].date);
    }
    return t;
  }, [data]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  if (data.length === 0) {
    return <div className="empty-results">No yield history available.</div>;
  }

  const presentTenors = TENOR_ORDER.filter(t => Array.isArray(history.series[t]));

  return (
    <div className="yield-curve-chart">
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0dcd5" />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#8a8279' }}
            stroke="#d4d0c8"
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            tick={{ fontSize: 11, fill: '#8a8279' }}
            stroke="#d4d0c8"
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#faf9f6',
              border: '1px solid #d4d0c8',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
            }}
            labelFormatter={(d: string) => {
              const date = new Date(d);
              return Number.isNaN(date.getTime())
                ? d
                : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            }}
            formatter={(value: number) => (value == null ? '—' : `${value.toFixed(2)}%`)}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, fontFamily: 'Inter, sans-serif', paddingTop: 8 }}
            iconType="line"
          />
          {presentTenors.map(tenor => (
            <Line
              key={tenor}
              type="monotone"
              dataKey={tenor}
              stroke={TENOR_COLORS[tenor]}
              strokeWidth={1.75}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
