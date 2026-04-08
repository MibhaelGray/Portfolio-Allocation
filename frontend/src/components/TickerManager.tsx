import React, { useState, KeyboardEvent } from 'react';

interface Props {
  tickers: string[];
  onChange: (tickers: string[]) => void;
}

const SUGGESTIONS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'];

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
          placeholder="Add ticker (e.g. MSFT) — press Enter"
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
