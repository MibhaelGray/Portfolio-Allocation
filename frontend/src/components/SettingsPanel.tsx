import React, { useState } from 'react';

const LOOKBACK_OPTIONS = [
  { label: '1 month',   days: 21  },
  { label: '2 months',  days: 42  },
  { label: '3 months',  days: 63  },
  { label: '6 months',  days: 126 },
  { label: '9 months',  days: 189 },
  { label: '1 year',    days: 252 },
  { label: '2 years',   days: 504 },
];

const PRESET_DAYS = new Set(LOOKBACK_OPTIONS.map(o => o.days));

interface Props {
  allocation: number;
  lookback: number;
  onAllocationChange: (v: number) => void;
  onLookbackChange: (v: number) => void;
}

export function SettingsPanel({ allocation, lookback, onAllocationChange, onLookbackChange }: Props) {
  const isCustom = !PRESET_DAYS.has(lookback);
  const [showCustom, setShowCustom] = useState(isCustom);

  return (
    <div className="settings-panel">
      <label>
        Total Allocation ($)
        <input
          type="number"
          min={100}
          step={500}
          value={allocation}
          onChange={(e) => onAllocationChange(Number(e.target.value))}
        />
      </label>
      <label>
        Lookback Window
        {showCustom ? (
          <div className="lookback-custom">
            <input
              type="number"
              min={5}
              max={504}
              value={lookback}
              onChange={(e) => onLookbackChange(Number(e.target.value))}
              placeholder="Trading days"
            />
            <button
              type="button"
              className="lookback-toggle"
              onClick={() => { setShowCustom(false); onLookbackChange(63); }}
              title="Use preset"
            >
              Presets
            </button>
          </div>
        ) : (
          <div className="lookback-custom">
            <select value={lookback} onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom') {
                setShowCustom(true);
              } else {
                onLookbackChange(Number(v));
              }
            }}>
              {LOOKBACK_OPTIONS.map(o => (
                <option key={o.days} value={o.days}>{o.label}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>
        )}
      </label>
    </div>
  );
}
