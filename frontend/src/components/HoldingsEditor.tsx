import React from 'react';

export interface Holding {
  id: string;
  ticker: string;
  amount: string;
}

interface Props {
  holdings: Holding[];
  onChange: (holdings: Holding[]) => void;
}

export function HoldingsEditor({ holdings, onChange }: Props) {
  function updateHolding(id: string, field: 'ticker' | 'amount', value: string) {
    onChange(
      holdings.map(h =>
        h.id === id
          ? { ...h, [field]: field === 'ticker' ? value.toUpperCase() : value }
          : h
      )
    );
  }

  function removeHolding(id: string) {
    if (holdings.length <= 1) return;
    onChange(holdings.filter(h => h.id !== id));
  }

  function addHolding() {
    onChange([...holdings, { id: String(Date.now()), ticker: '', amount: '' }]);
  }

  function handleAmountKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'Enter' && index === holdings.length - 1) {
      addHolding();
    }
  }

  const tickers = holdings.map(h => h.ticker.trim());
  const duplicates = new Set(
    tickers.filter((t, i) => t && tickers.indexOf(t) !== i)
  );

  const total = holdings.reduce((sum, h) => {
    const n = parseFloat(h.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const validCount = holdings.filter(
    h => h.ticker.trim() && parseFloat(h.amount) > 0
  ).length;

  return (
    <div className="holdings-editor">
      {holdings.map((h, i) => (
        <div key={h.id} className="holding-row">
          <input
            className={`ticker-input${duplicates.has(h.ticker.trim()) ? ' input-error' : ''}`}
            type="text"
            placeholder="TICKER"
            value={h.ticker}
            onChange={e => updateHolding(h.id, 'ticker', e.target.value)}
          />
          <span className="amount-prefix">$</span>
          <input
            className="amount-input"
            type="number"
            placeholder="Amount"
            min={0}
            step={100}
            value={h.amount}
            onChange={e => updateHolding(h.id, 'amount', e.target.value)}
            onKeyDown={e => handleAmountKeyDown(e, i)}
          />
          <button
            className="holding-remove"
            onClick={() => removeHolding(h.id)}
            disabled={holdings.length <= 1}
            title="Remove"
          >
            &times;
          </button>
        </div>
      ))}

      <button className="add-holding-btn" onClick={addHolding} type="button">
        + Add Holding
      </button>

      <p className="holdings-summary">
        {validCount} holding{validCount !== 1 ? 's' : ''} &mdash; Total: $
        {total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
