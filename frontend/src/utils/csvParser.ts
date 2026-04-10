export interface ParsedHolding {
  ticker: string;
  amount: number;
  quantity?: number;
  price?: number;
  source: 'value' | 'computed';
}

export interface ParseResult {
  holdings: ParsedHolding[];
  skipped: string[];
  method: string;
  errors: string[];
}

const TICKER_PATTERNS = ['symbol', 'ticker', 'stock symbol', 'instrument'];
const VALUE_PATTERNS = ['market value', 'current value', 'mkt value', 'position value'];
const QTY_PATTERNS = ['quantity', 'qty', 'shares', 'position'];
const PRICE_PATTERNS = ['last price', 'current price', 'close price', 't.price', 'price', 'last'];

const SKIP_TICKERS = /^(cash|total|subtotal|summary|account|net |--)/i;

function matchColumn(header: string, patterns: string[]): boolean {
  const h = header.toLowerCase().trim();
  return patterns.some(p => h === p || h.includes(p));
}

function parseNumber(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim();
  // Handle parentheses for negatives: (1,234.56) → -1234.56
  const negative = s.startsWith('(') && s.endsWith(')');
  if (negative) s = s.slice(1, -1);
  // Strip currency symbols, commas, spaces
  s = s.replace(/[$€£¥,\s]/g, '');
  const n = parseFloat(s);
  return negative ? -n : n;
}

function detectDelimiter(lines: string[]): string {
  // Check first few lines for tabs — if any line has tabs, it's tab-delimited
  for (const line of lines.slice(0, 5)) {
    if (line.includes('\t')) return '\t';
  }
  return ',';
}

function splitCSVLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t');

  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function findHeaderRow(lines: string[][]): number {
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = lines[i];
    let matches = 0;
    for (const cell of cells) {
      if (matchColumn(cell, TICKER_PATTERNS)) matches++;
      if (matchColumn(cell, VALUE_PATTERNS)) matches++;
      if (matchColumn(cell, QTY_PATTERNS)) matches++;
      if (matchColumn(cell, PRICE_PATTERNS)) matches++;
    }
    if (matches >= 2) return i;
  }
  return -1;
}

export function parseCSV(text: string): ParseResult {
  const errors: string[] = [];
  const skipped: string[] = [];

  const rawLines = text.split(/\r?\n/).filter(l => l.trim());
  if (rawLines.length === 0) {
    return { holdings: [], skipped: [], method: '', errors: ['The file appears to be empty.'] };
  }

  const delim = detectDelimiter(rawLines);
  const lines = rawLines.map(l => splitCSVLine(l, delim));
  const headerIdx = findHeaderRow(lines);

  if (headerIdx === -1) {
    return {
      holdings: [],
      skipped: [],
      method: '',
      errors: ['Could not detect column headers. Expected columns like Symbol, Market Value, Quantity, Price, etc.'],
    };
  }

  const headers = lines[headerIdx];

  // Detect column indices
  let tickerCol = -1;
  let valueCol = -1;
  let qtyCol = -1;
  let priceCol = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (tickerCol === -1 && matchColumn(h, TICKER_PATTERNS)) tickerCol = i;
    if (valueCol === -1 && matchColumn(h, VALUE_PATTERNS)) valueCol = i;
    if (qtyCol === -1 && matchColumn(h, QTY_PATTERNS)) qtyCol = i;
    // Match price last to avoid "price" matching "last price" column already assigned
    if (priceCol === -1 && matchColumn(h, PRICE_PATTERNS) && i !== valueCol) priceCol = i;
  }

  if (tickerCol === -1) {
    return {
      holdings: [],
      skipped: [],
      method: '',
      errors: ['Could not find a ticker/symbol column.'],
    };
  }

  const useValue = valueCol !== -1;
  const useComputed = !useValue && qtyCol !== -1 && priceCol !== -1;

  if (!useValue && !useComputed) {
    const found = [`Symbol (col ${tickerCol + 1})`];
    if (qtyCol !== -1) found.push(`Quantity (col ${qtyCol + 1})`);
    if (priceCol !== -1) found.push(`Price (col ${priceCol + 1})`);
    return {
      holdings: [],
      skipped: [],
      method: '',
      errors: [
        `Found ${found.join(', ')} but need either a Market Value column or both Quantity and Price columns to determine dollar amounts.`,
      ],
    };
  }

  const method = useValue
    ? `Detected: ${headers[tickerCol].trim()}, ${headers[valueCol].trim()}`
    : `Detected: ${headers[tickerCol].trim()}, ${headers[qtyCol].trim()} x ${headers[priceCol].trim()}`;

  // Parse data rows
  const holdingsMap = new Map<string, ParsedHolding>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length <= tickerCol) continue;

    let ticker = row[tickerCol]?.trim().toUpperCase();
    if (!ticker) continue;

    // Strip exchange prefix (e.g. "NASDAQ:AAPL" → "AAPL")
    if (ticker.includes(':')) ticker = ticker.split(':').pop()!;

    // Skip non-stock rows
    if (SKIP_TICKERS.test(ticker)) {
      skipped.push(ticker);
      continue;
    }
    // Skip tickers with spaces (likely description rows)
    if (ticker.includes(' ')) {
      skipped.push(ticker);
      continue;
    }

    let amount: number;
    let quantity: number | undefined;
    let price: number | undefined;
    let source: 'value' | 'computed';

    if (useValue) {
      amount = parseNumber(row[valueCol] || '');
      source = 'value';
    } else {
      quantity = parseNumber(row[qtyCol] || '');
      price = parseNumber(row[priceCol] || '');
      amount = (quantity || 0) * (price || 0);
      source = 'computed';
    }

    // Use absolute value (short positions are still real dollar exposure)
    amount = Math.abs(amount);

    // Skip invalid or zero amounts
    if (isNaN(amount) || amount === 0) {
      skipped.push(ticker);
      continue;
    }

    // Deduplicate by summing
    const existing = holdingsMap.get(ticker);
    if (existing) {
      existing.amount += amount;
      if (quantity !== undefined && existing.quantity !== undefined) {
        existing.quantity += quantity;
      }
    } else {
      holdingsMap.set(ticker, { ticker, amount, quantity, price, source });
    }
  }

  const holdings = Array.from(holdingsMap.values());

  if (holdings.length === 0) {
    errors.push('No valid holdings found in the file.');
  }

  return { holdings, skipped, method, errors };
}
