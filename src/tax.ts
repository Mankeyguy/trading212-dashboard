// Czech tax view of the portfolio (§ 4 odst. 1 písm. w) and x) ZDP):
//  - časový test: gains from securities held MORE than 3 years are exempt,
//  - hodnotový test (from 2025): exempt if gross proceeds from sales in the year ≤ 100 000 Kč.
// Buys and sells are matched FIFO per instrument. All amounts are in the account currency (CZK).

import type { HistoricalOrder, Position } from '../shared/types';

export const TIME_TEST_YEARS = 3;
export const VALUE_TEST_LIMIT = 100_000;
export const VALUE_TEST_FROM_YEAR = 2025;
export const TAX_RATE = 0.15;
const EPS = 1e-6;

export interface Lot {
  ticker: string;
  name: string;
  acquiredAt: string; // ISO
  freeFrom: Date; // first day the lot can be sold tax-free
  quantity: number; // remaining quantity
  cost: number; // remaining cost basis (CZK)
  value: number; // current market value (CZK)
  passed: boolean;
}

export interface SaleMatch {
  ticker: string;
  name: string;
  soldAt: string;
  year: number;
  quantity: number;
  proceeds: number;
  cost: number;
  exemptByTime: boolean;
}

export interface InstrumentTax {
  ticker: string;
  name: string;
  lots: Lot[];
  passedQty: number;
  passedValue: number;
  passedGain: number;
  lockedQty: number;
  lockedValue: number;
  lockedGain: number;
  nextFree: Date | null;
  warning: string | null;
}

export interface YearSales {
  year: number;
  grossProceeds: number; // all sales, for the value test
  exemptByTimeProceeds: number;
  taxableProceeds: number; // proceeds of sales not passing the time test
  taxableCost: number;
  taxableGain: number; // taxableProceeds − taxableCost (losses offset gains within the year)
  valueTestApplies: boolean;
  valueTestPassed: boolean;
}

export interface TaxAnalysis {
  instruments: InstrumentTax[];
  lots: Lot[];
  sales: SaleMatch[];
  years: YearSales[];
  warnings: string[];
}

const toDay = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Holding must EXCEED 3 years → tax-free from the day after the 3rd anniversary. */
export function freeFromDate(acquiredIso: string): Date {
  const d = toDay(acquiredIso);
  return new Date(d.getFullYear() + TIME_TEST_YEARS, d.getMonth(), d.getDate() + 1);
}

const fillTime = (o: HistoricalOrder) => o.fill?.filledAt ?? o.order.createdAt;

export function analyzeTaxes(orders: HistoricalOrder[], positions: Position[], today = new Date()): TaxAnalysis {
  const warnings: string[] = [];
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fills = orders
    .filter((o) => o.fill && o.fill.quantity && o.order.status !== 'CANCELLED' && o.order.status !== 'REJECTED')
    .sort((a, b) => fillTime(a).localeCompare(fillTime(b)));

  type OpenLot = { acquiredAt: string; quantity: number; cost: number };
  const open = new Map<string, OpenLot[]>();
  const names = new Map<string, string>();
  const sales: SaleMatch[] = [];
  const unmatchedSells = new Set<string>();

  for (const o of fills) {
    const f = o.fill!;
    const ticker = o.order.ticker;
    names.set(ticker, o.order.instrument?.name ?? names.get(ticker) ?? ticker);
    const qty = Math.abs(f.quantity);
    const amount = Math.abs(f.walletImpact?.netValue ?? qty * f.price);
    const lots = open.get(ticker) ?? [];
    open.set(ticker, lots);

    if (o.order.side === 'BUY') {
      lots.push({ acquiredAt: f.filledAt, quantity: qty, cost: amount });
      continue;
    }

    // SELL: consume FIFO; proceeds split pro rata over matched quantity.
    let remaining = qty;
    const year = new Date(f.filledAt).getFullYear();
    while (remaining > EPS && lots.length) {
      const lot = lots[0];
      const take = Math.min(lot.quantity, remaining);
      const costPart = lot.cost * (take / lot.quantity);
      sales.push({
        ticker,
        name: names.get(ticker)!,
        soldAt: f.filledAt,
        year,
        quantity: take,
        proceeds: amount * (take / qty),
        cost: costPart,
        exemptByTime: toDay(f.filledAt) >= freeFromDate(lot.acquiredAt),
      });
      lot.quantity -= take;
      lot.cost -= costPart;
      remaining -= take;
      if (lot.quantity <= EPS) lots.shift();
    }
    if (remaining > EPS) {
      unmatchedSells.add(ticker);
      sales.push({ ticker, name: names.get(ticker)!, soldAt: f.filledAt, year, quantity: remaining, proceeds: amount * (remaining / qty), cost: 0, exemptByTime: false });
    }
  }
  if (unmatchedSells.size)
    warnings.push(`Prodeje bez dohledaného nákupu (chybí starší historie?): ${[...unmatchedSells].join(', ')}. Jejich nákupní cena je počítaná jako 0.`);

  // Reconcile with current positions (splits, transfers, gaps in history).
  const instruments: InstrumentTax[] = [];
  const allLots: Lot[] = [];
  for (const p of positions) {
    const ticker = p.instrument.ticker;
    const lots = open.get(ticker) ?? [];
    const histQty = lots.reduce((s, l) => s + l.quantity, 0);
    const unitValue = p.quantity ? p.walletImpact.currentValue / p.quantity : 0;
    let warning: string | null = null;

    if (!lots.length) {
      warning = 'Chybí historie nákupů, datum nabytí nelze určit.';
    } else if (Math.abs(histQty - p.quantity) > Math.max(1e-4, p.quantity * 0.001)) {
      // Most often a stock split: keep dates and cost, scale quantities to the real position.
      const ratio = p.quantity / histQty;
      lots.forEach((l) => (l.quantity *= ratio));
      warning = `Počet kusů v historii (${round(histQty)}) nesedí s pozicí (${round(p.quantity)}), kusy přepočteny poměrem ${round(ratio)} (split?).`;
    }

    const instLots: Lot[] = lots.map((l) => {
      const freeFrom = freeFromDate(l.acquiredAt);
      return {
        ticker,
        name: p.instrument.name,
        acquiredAt: l.acquiredAt,
        freeFrom,
        quantity: l.quantity,
        cost: l.cost,
        value: l.quantity * unitValue,
        passed: freeFrom <= todayDay,
      };
    });
    const passed = instLots.filter((l) => l.passed);
    const locked = instLots.filter((l) => !l.passed);
    const sum = (ls: Lot[], f: (l: Lot) => number) => ls.reduce((s, l) => s + f(l), 0);
    instruments.push({
      ticker,
      name: p.instrument.name,
      lots: instLots,
      passedQty: sum(passed, (l) => l.quantity),
      passedValue: sum(passed, (l) => l.value),
      passedGain: sum(passed, (l) => l.value - l.cost),
      lockedQty: lots.length ? sum(locked, (l) => l.quantity) : p.quantity,
      lockedValue: lots.length ? sum(locked, (l) => l.value) : p.walletImpact.currentValue,
      lockedGain: lots.length ? sum(locked, (l) => l.value - l.cost) : p.walletImpact.unrealizedProfitLoss,
      nextFree: locked.length ? locked[0].freeFrom : null,
      warning,
    });
    allLots.push(...instLots);
  }

  const byYear = new Map<number, SaleMatch[]>();
  for (const s of sales) byYear.set(s.year, [...(byYear.get(s.year) ?? []), s]);
  const years: YearSales[] = [...byYear.entries()]
    .map(([year, ss]) => {
      const gross = ss.reduce((a, s) => a + s.proceeds, 0);
      const taxable = ss.filter((s) => !s.exemptByTime);
      const taxableProceeds = taxable.reduce((a, s) => a + s.proceeds, 0);
      const taxableCost = taxable.reduce((a, s) => a + s.cost, 0);
      const valueTestApplies = year >= VALUE_TEST_FROM_YEAR;
      return {
        year,
        grossProceeds: gross,
        exemptByTimeProceeds: gross - taxableProceeds,
        taxableProceeds,
        taxableCost,
        taxableGain: taxableProceeds - taxableCost,
        valueTestApplies,
        valueTestPassed: valueTestApplies && gross <= VALUE_TEST_LIMIT,
      };
    })
    .sort((a, b) => b.year - a.year);

  return { instruments, lots: allLots, sales, years, warnings };
}

/** Value of lots becoming tax-free per period (at today's prices), for the release calendar. */
export function releaseSchedule(lots: Lot[], granularity: 'year' | 'month') {
  const key = (d: Date) =>
    granularity === 'year' ? String(d.getFullYear()) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const map = new Map<string, { key: string; value: number; cost: number; lots: Lot[] }>();
  for (const l of lots.filter((x) => !x.passed)) {
    const k = key(l.freeFrom);
    const e = map.get(k) ?? { key: k, value: 0, cost: 0, lots: [] };
    e.value += l.value;
    e.cost += l.cost;
    e.lots.push(l);
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
