import React, { useState } from 'react';

interface Props {
  onExport: () => Promise<void>;
}

export function ExportButton({ onExport }: Props) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      className="export-btn"
      onClick={handleClick}
      disabled={exporting}
    >
      {exporting ? 'Exporting…' : 'Export PDF'}
    </button>
  );
}
