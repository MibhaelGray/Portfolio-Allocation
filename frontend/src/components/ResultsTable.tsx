import React, { useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import type { TickerResult } from '../types/portfolio';

const money = (v: number, currency: string) => {
  try {
    return v.toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    return `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }
};
const usd = (v: number) => money(v, 'USD');
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const col = createColumnHelper<TickerResult>();

const columns = [
  col.accessor('name',     { header: 'Name' }),
  col.accessor('ticker',   { header: 'Ticker' }),
  col.accessor('last_px',  { header: 'Last Price', cell: (i) => money(i.getValue(), i.row.original.currency) }),
  col.accessor('rv',       { header: 'Realized Vol', cell: (i) => pct(i.getValue()) }),
  col.accessor('weight',   { header: 'Weight', cell: (i) => pct(i.getValue()) }),
  col.accessor('risk_contribution', { header: 'Risk Contrib.', cell: (i) => pct(i.getValue()) }),
  col.accessor('position', { header: 'Position $', cell: (i) => usd(i.getValue()) }),
];

export function ResultsTable({ data }: { data: TickerResult[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) return null;

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  className={h.column.getCanSort() ? 'sortable' : ''}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
