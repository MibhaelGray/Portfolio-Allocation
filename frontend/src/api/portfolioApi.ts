import type {
  CalculateRequest, CalculateResponse,
  SimulateRequest, SimulateResponse,
  CorrelationRequest, CorrelationResponse,
} from '../types/portfolio';

export async function calculatePortfolio(req: CalculateRequest): Promise<CalculateResponse> {
  const response = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return response.json() as Promise<CalculateResponse>;
}

export async function simulatePortfolio(req: SimulateRequest): Promise<SimulateResponse> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return response.json() as Promise<SimulateResponse>;
}

export async function fetchCorrelation(
  req: CorrelationRequest,
  signal?: AbortSignal,
): Promise<CorrelationResponse> {
  const response = await fetch('/api/correlation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  return response.json() as Promise<CorrelationResponse>;
}
