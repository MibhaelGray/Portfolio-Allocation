import React from 'react';
import type { FailedTicker } from '../types/portfolio';

interface Props {
  failed: FailedTicker[];
  fetchError: string | null;
}

export function ErrorPanel({ failed, fetchError }: Props) {
  if (!fetchError && failed.length === 0) return null;

  return (
    <div className="error-panel" role="alert">
      {fetchError && <p className="fetch-error">Request failed: {fetchError}</p>}
      {failed.length > 0 && (
        <>
          <p className="failed-header">{failed.length} ticker(s) could not be fetched:</p>
          <ul>
            {failed.map((f) => (
              <li key={f.ticker}>
                <strong>{f.ticker}</strong>: {f.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
