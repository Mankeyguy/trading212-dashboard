import type { DividendItem, TransactionItem } from '../shared/types';
import { monthKey } from './format';

/** Signed cash-flow of a transaction from the investor's point of view (+ in, − out). */
export function flow(t: TransactionItem): number {
  if (t.type === 'DEPOSIT') return Math.abs(t.amount);
  if (t.type === 'WITHDRAW') return -Math.abs(t.amount);
  if (t.type === 'TRANSFER') return t.amount;
  return 0; // fees are costs, not deposits
}

/** All months YYYY-MM from `from` to the current month (inclusive). */
export function monthRange(from: string, to = monthKey(new Date().toISOString())): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function sumBy<T>(items: T[], get: (x: T) => number) {
  return items.reduce((s, x) => s + get(x), 0);
}

/** Cumulative net deposits per month. */
export function cumulativeDeposits(tx: TransactionItem[]) {
  const byMonth = new Map<string, { deposits: number; withdrawals: number }>();
  for (const t of tx) {
    const f = flow(t);
    if (!f) continue;
    const k = monthKey(t.dateTime);
    const e = byMonth.get(k) ?? { deposits: 0, withdrawals: 0 };
    if (f > 0) e.deposits += f;
    else e.withdrawals += -f;
    byMonth.set(k, e);
  }
  if (!byMonth.size) return [];
  let total = 0;
  return monthRange([...byMonth.keys()].sort()[0]).map((month) => {
    const e = byMonth.get(month) ?? { deposits: 0, withdrawals: 0 };
    total += e.deposits - e.withdrawals;
    return { month, ...e, net: e.deposits - e.withdrawals, cumulative: total };
  });
}

export function dividendsLast12m(divs: DividendItem[]) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const iso = cutoff.toISOString();
  return sumBy(
    divs.filter((d) => d.paidOn >= iso),
    (d) => d.amount,
  );
}
