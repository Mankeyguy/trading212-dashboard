const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function money(value: number | null | undefined, currency: string, opts: { sign?: boolean; compact?: boolean } = {}) {
  if (value == null || Number.isNaN(value)) return '–';
  const key = `${currency}|${opts.sign}|${opts.compact}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: opts.compact ? 0 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
      notation: opts.compact && Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    });
    moneyFormatters.set(key, f);
  }
  return f.format(value);
}

export function num(value: number | null | undefined, maxDigits = 4) {
  if (value == null) return '–';
  return value.toLocaleString('cs-CZ', { maximumFractionDigits: maxDigits });
}

export function pct(value: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}) {
  if (value == null || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'percent',
    maximumFractionDigits: opts.digits ?? 2,
    minimumFractionDigits: opts.digits ?? 2,
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  }).format(value);
}

export const date = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ');
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });

export const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit' });
}

/** Ticker without the T212 suffix: "AAPL_US_EQ" -> "AAPL", "VWCEd_EQ" -> "VWCE". */
export function shortTicker(ticker: string) {
  const base = ticker.split('_')[0];
  return base.replace(/[a-z]+$/, '') || base;
}
