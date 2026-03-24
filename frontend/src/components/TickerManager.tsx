import React, { useState, KeyboardEvent } from 'react';

interface Props {
  tickers: string[];
  onChange: (tickers: string[]) => void;
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
      </div>
    </div>
  );
}
