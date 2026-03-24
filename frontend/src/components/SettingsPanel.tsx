import React from 'react';

interface Props {
  allocation: number;
  lookback: number;
  onAllocationChange: (v: number) => void;
  onLookbackChange: (v: number) => void;
}

export function SettingsPanel({ allocation, lookback, onAllocationChange, onLookbackChange }: Props) {
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
        Lookback Window (trading days)
        <input
          type="number"
          min={5}
          max={504}
          step={1}
          value={lookback}
          onChange={(e) => onLookbackChange(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
