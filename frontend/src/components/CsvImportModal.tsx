import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { parseCSV, type ParseResult } from '../utils/csvParser';
import type { Holding } from './HoldingsEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (holdings: Holding[]) => void;
}

function makeId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

export function CsvImportModal({ open, onClose, onImport }: Props) {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setResult(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setResult(parseCSV(text));
    };
    reader.readAsText(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleImport() {
    if (!result) return;
    const holdings: Holding[] = result.holdings.map(h => ({
      id: makeId(),
      ticker: h.ticker,
      amount: String(Math.round(h.amount)),
    }));
    onImport(holdings);
    handleClose();
  }

  if (!open) return null;

  const hasError = result && (result.errors.length > 0 && result.holdings.length === 0);
  const hasHoldings = result && result.holdings.length > 0;

  return createPortal(
    <div className="csv-modal-overlay" onClick={handleClose}>
      <div className="csv-modal" onClick={e => e.stopPropagation()}>
        <h3 className="csv-modal-title">Import Portfolio</h3>

        {!result && (
          <>
            <p className="csv-modal-desc">
              Upload a CSV export from your broker. We'll auto-detect columns like Symbol, Market Value, Quantity, and Price.
            </p>
            <div
              className="csv-dropzone"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              <p className="dropzone-text">Click to select a file or drag it here</p>
              <p className="dropzone-hint">.csv or .txt</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </>
        )}

        {hasError && (
          <>
            <div className="csv-error">
              {result!.errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
            <div className="csv-modal-actions">
              <button className="csv-btn-secondary" onClick={reset}>Try Again</button>
              <button className="csv-btn-secondary" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}

        {hasHoldings && (
          <>
            <p className="csv-preview-meta">
              {fileName} &mdash; {result!.method}
            </p>

            <div className="csv-preview-table-wrapper">
              <table className="csv-preview-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result!.holdings.map(h => (
                    <tr key={h.ticker}>
                      <td>{h.ticker}</td>
                      <td>${h.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result!.skipped.length > 0 && (
              <p className="csv-skipped">
                Skipped {result!.skipped.length} row{result!.skipped.length !== 1 ? 's' : ''}: {result!.skipped.slice(0, 5).join(', ')}
                {result!.skipped.length > 5 ? `, +${result!.skipped.length - 5} more` : ''}
              </p>
            )}

            <div className="csv-modal-actions">
              <button className="csv-btn-primary" onClick={handleImport}>
                Import {result!.holdings.length} Holding{result!.holdings.length !== 1 ? 's' : ''}
              </button>
              <button className="csv-btn-secondary" onClick={reset}>Try Again</button>
              <button className="csv-btn-secondary" onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
