import React, { useState, KeyboardEvent, ClipboardEvent } from 'react';

interface Props {
  tickers: string[];
  onChange: (tickers: string[]) => void;
}

const SUGGESTIONS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];

function parseTickersFromCsv(text: string): string[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect delimiter: tab or comma
  const header = lines[0];
  const delim = header.includes('\t') ? '\t' : ',';
  const cols = header.split(delim).map((c) => c.trim().toLowerCase());

  // Find the ticker/instrument/symbol column
  const tickerIdx = cols.findIndex((c) =>
    ['instrument', 'ticker', 'symbol', 'stock'].includes(c)
  );
  if (tickerIdx === -1) return [];

  const tickers: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(delim);
    const val = fields[tickerIdx]?.trim().toUpperCase();
    if (val && /^[A-Z0-9.]+$/.test(val)) {
      tickers.push(val);
    }
  }
  return tickers;
}

export function TickerManager({ tickers, onChange }: Props) {
  const [input, setInput] = useState('');

  function add() {
    const val = input.trim().toUpperCase();
    if (!val || tickers.includes(val)) {
      setInput('');
      return;
    }
    onChange([...tickers, val]);
    setInput('');
  }

  function remove(ticker: string) {
    onChange(tickers.filter((t) => t !== ticker));
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    const parsed = parseTickersFromCsv(text);
    if (parsed.length > 0) {
      e.preventDefault();
      const unique = [...new Set([...tickers, ...parsed])];
      onChange(unique);
      setInput('');
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="ticker-manager">
      <div className="ticker-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder="Add ticker or paste CSV — press Enter"
          aria-label="Add ticker symbol"
        />
        <button onClick={add}>Add</button>
      </div>
      <div className="ticker-chips">
        {tickers.map((t) => (
          <span key={t} className="chip">
            {t}
            <button onClick={() => remove(t)} aria-label={`Remove ${t}`} className="chip-remove">
              ×
            </button>
          </span>
        ))}
        {tickers.length === 0 && SUGGESTIONS.filter(s => !tickers.includes(s)).map((s) => (
          <span
            key={s}
            className="chip chip-ghost"
            onClick={() => onChange([...tickers, s])}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onChange([...tickers, s])}
          >
            {s}
            <span className="chip-plus">+</span>
          </span>
        ))}
      </div>
    </div>
  );
}
