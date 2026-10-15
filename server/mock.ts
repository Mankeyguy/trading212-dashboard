// Fake Trading 212 API for trying the dashboard without an API key (T212_MOCK=1).
// Responses follow the real response shapes, including cursor pagination of history.

import type { Fetcher } from './t212.js';
import type {
  AccountSummary,
  DividendItem,
  HistoricalOrder,
  Instrument,
  PieDetail,
  PieSummary,
  Position,
  TransactionItem,
} from '../shared/types.js';

const CCY = 'CZK';
const FX: Record<string, number> = { USD: 22.8, EUR: 25.1, GBP: 29.4, CZK: 1 };

// Deterministic PRNG so the mock looks the same on every restart.
let seed = 212;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const INSTRUMENTS: (Instrument & { price: number; growth: number; divYield: number })[] = [
  { ticker: 'AAPL_US_EQ', name: 'Apple', isin: 'US0378331005', currency: 'USD', price: 228, growth: 0.25, divYield: 0.005 },
  { ticker: 'MSFT_US_EQ', name: 'Microsoft', isin: 'US5949181045', currency: 'USD', price: 512, growth: 0.3, divYield: 0.007 },
  { ticker: 'NVDA_US_EQ', name: 'NVIDIA', isin: 'US67066G1040', currency: 'USD', price: 182, growth: 1.4, divYield: 0 },
  { ticker: 'VWCEd_EQ', name: 'Vanguard FTSE All-World (Acc)', isin: 'IE00BK5BQT80', currency: 'EUR', price: 141, growth: 0.18, divYield: 0 },
  { ticker: 'ASMLa_EQ', name: 'ASML Holding', isin: 'NL0010273215', currency: 'EUR', price: 702, growth: -0.08, divYield: 0.009 },
  { ticker: 'KO_US_EQ', name: 'Coca-Cola', isin: 'US1912161007', currency: 'USD', price: 69, growth: 0.08, divYield: 0.03 },
  { ticker: 'JNJ_US_EQ', name: 'Johnson & Johnson', isin: 'US4781601046', currency: 'USD', price: 176, growth: 0.05, divYield: 0.03 },
  { ticker: 'O_US_EQ', name: 'Realty Income', isin: 'US7561091049', currency: 'USD', price: 58, growth: -0.04, divYield: 0.055 },
  { ticker: 'SAPd_EQ', name: 'SAP', isin: 'DE0007164600', currency: 'EUR', price: 248, growth: 0.35, divYield: 0.01 },
  { ticker: 'PEP_US_EQ', name: 'PepsiCo', isin: 'US7134481081', currency: 'USD', price: 148, growth: -0.1, divYield: 0.037 },
  { ticker: 'GOOGL_US_EQ', name: 'Alphabet (Class A)', isin: 'US02079K3059', currency: 'USD', price: 245, growth: 0.4, divYield: 0.004 },
  { ticker: 'VUSAl_EQ', name: 'Vanguard S&P 500 (Dist)', isin: 'IE00B3XXRP09', currency: 'GBP', price: 98, growth: 0.2, divYield: 0.011 },
];
const inst = (i: (typeof INSTRUMENTS)[number]): Instrument => ({
  ticker: i.ticker,
  name: i.name,
  isin: i.isin,
  currency: i.currency,
});

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const now = new Date();
const monthsAgo = (m: number, day = 5) => {
  const d = new Date(now.getFullYear(), now.getMonth() - m, day, 15, 30);
  return d > now ? new Date(now.getTime() - 3_600_000) : d;
};

function build() {
  const orders: HistoricalOrder[] = [];
  const dividends: DividendItem[] = [];
  const transactions: TransactionItem[] = [];
  const holdings = new Map<string, { qty: number; cost: number; costAcc: number; created: string }>();
  let id = 1_000_000;
  let realized = 0;
  let cash = 0;

  for (let m = 36; m >= 0; m--) {
    const d = monthsAgo(m, 3);
    const deposit = m % 12 === 0 ? 30_000 : 8_000;
    transactions.push({ reference: `TX-${id++}`, type: 'DEPOSIT', amount: deposit, currency: CCY, dateTime: d.toISOString() });
    cash += deposit;
    if (m === 20) {
      transactions.push({ reference: `TX-${id++}`, type: 'WITHDRAW', amount: -15_000, currency: CCY, dateTime: monthsAgo(m, 20).toISOString() });
      cash -= 15_000;
    }

    // a few buys each month
    for (let k = 0; k < 3; k++) {
      const i = INSTRUMENTS[Math.floor(rand() * INSTRUMENTS.length)];
      const progress = (36 - m) / 36;
      const price = round(i.price / (1 + i.growth) ** (1 - progress) * (0.95 + rand() * 0.1));
      const valueAcc = 1_500 + Math.floor(rand() * 2_500);
      const qty = round(valueAcc / FX[i.currency] / price, 6);
      const at = monthsAgo(m, 4 + k * 7);
      const h = holdings.get(i.ticker) ?? { qty: 0, cost: 0, costAcc: 0, created: at.toISOString() };
      h.qty += qty;
      h.cost += qty * price;
      h.costAcc += valueAcc;
      holdings.set(i.ticker, h);
      cash -= valueAcc;
      orders.push(order(id++, i, 'BUY', qty, price, at, valueAcc, 0));
    }

    // occasional partial sell
    if (m % 7 === 3) {
      const [ticker, h] = [...holdings.entries()][Math.floor(rand() * holdings.size)];
      const i = INSTRUMENTS.find((x) => x.ticker === ticker)!;
      const qty = round(h.qty * 0.3, 6);
      const avgAcc = h.costAcc / h.qty;
      const price = round((i.price / (1 + i.growth) ** (m / 36)) * 1.02);
      const proceeds = qty * price * FX[i.currency];
      const pl = round(proceeds - qty * avgAcc);
      h.cost -= (h.cost / h.qty) * qty;
      h.costAcc -= avgAcc * qty;
      h.qty -= qty;
      realized += pl;
      cash += proceeds;
      orders.push(order(id++, i, 'SELL', qty, price, monthsAgo(m, 26), proceeds, pl));
    }

    // quarterly dividends
    if (m % 3 === 0) {
      for (const [ticker, h] of holdings) {
        const i = INSTRUMENTS.find((x) => x.ticker === ticker)!;
        if (!i.divYield) continue;
        const perShare = round((i.price * i.divYield) / 4, 4);
        const amount = round(perShare * h.qty * FX[i.currency] * 0.85);
        cash += amount;
        dividends.push({
          reference: `DIV-${id++}`,
          ticker,
          instrument: inst(i),
          amount,
          amountInEuro: round(amount / FX.EUR),
          currency: CCY,
          grossAmountPerShare: perShare,
          tickerCurrency: i.currency,
          quantity: round(h.qty, 6),
          paidOn: monthsAgo(m, 15).toISOString(),
          type: 'ORDINARY',
        });
      }
    }
    if (m % 6 === 0) {
      transactions.push({ reference: `TX-${id++}`, type: 'FEE', amount: -12, currency: CCY, dateTime: monthsAgo(m, 28).toISOString() });
      cash -= 12;
    }
  }

  const positions: Position[] = [...holdings.entries()].map(([ticker, h]) => {
    const i = INSTRUMENTS.find((x) => x.ticker === ticker)!;
    const currentValue = round(h.qty * i.price * FX[i.currency]);
    const fxImpact = round(currentValue * (i.currency === 'CZK' ? 0 : (rand() - 0.6) * 0.04));
    return {
      instrument: inst(i),
      quantity: round(h.qty, 6),
      quantityAvailableForTrading: round(h.qty, 6),
      quantityInPies: 0,
      averagePricePaid: round(h.cost / h.qty, 4),
      currentPrice: i.price,
      createdAt: h.created,
      walletImpact: {
        currency: CCY,
        currentValue,
        totalCost: round(h.costAcc),
        unrealizedProfitLoss: round(currentValue - h.costAcc),
        fxImpact,
      },
    };
  });

  const currentValue = positions.reduce((s, p) => s + p.walletImpact.currentValue, 0);
  const totalCost = positions.reduce((s, p) => s + p.walletImpact.totalCost, 0);
  const inPies = 0;
  const summary: AccountSummary = {
    id: 21212121,
    currency: CCY,
    totalValue: round(currentValue + cash),
    cash: { availableToTrade: round(cash - 500), inPies, reservedForOrders: 500 },
    investments: {
      currentValue: round(currentValue),
      totalCost: round(totalCost),
      realizedProfitLoss: round(realized),
      unrealizedProfitLoss: round(currentValue - totalCost),
    },
  };

  const desc = <T>(arr: T[], date: (x: T) => string) => arr.sort((a, b) => date(b).localeCompare(date(a)));
  desc(orders, (o) => o.fill!.filledAt);
  desc(dividends, (d) => d.paidOn);
  desc(transactions, (t) => t.dateTime);

  const pies: PieSummary[] = [
    pieSummary(101, 82_000, 0.12, 2_350),
    pieSummary(102, 41_000, -0.03, 4_120),
  ];
  const pieDetails: Record<number, PieDetail> = {
    101: pieDetail(101, 'Tech růst', ['NVDA_US_EQ', 'MSFT_US_EQ', 'GOOGL_US_EQ', 'ASMLa_EQ'], [0.3, 0.3, 0.25, 0.15]),
    102: pieDetail(102, 'Dividendy', ['KO_US_EQ', 'JNJ_US_EQ', 'O_US_EQ', 'PEP_US_EQ'], [0.25, 0.25, 0.3, 0.2]),
  };

  return { summary, positions, orders, dividends, transactions, pies, pieDetails };
}

function order(
  id: number,
  i: (typeof INSTRUMENTS)[number],
  side: 'BUY' | 'SELL',
  qty: number,
  price: number,
  at: Date,
  netValue: number,
  pl: number,
): HistoricalOrder {
  return {
    order: {
      id,
      ticker: i.ticker,
      instrument: inst(i),
      side,
      type: 'MARKET',
      status: 'FILLED',
      strategy: 'VALUE',
      value: round(qty * price),
      quantity: side === 'SELL' ? -qty : qty,
      filledQuantity: qty,
      filledValue: round(qty * price),
      currency: i.currency,
      initiatedFrom: rand() > 0.5 ? 'IOS' : 'WEB',
      createdAt: at.toISOString(),
    },
    fill: {
      id: id * 10,
      filledAt: new Date(at.getTime() + 2_000).toISOString(),
      price,
      quantity: qty,
      type: 'TRADE',
      walletImpact: {
        currency: CCY,
        fxRate: FX[i.currency],
        netValue: round(netValue),
        realisedProfitLoss: pl,
        taxes: i.currency === CCY ? [] : [{ name: 'CURRENCY_CONVERSION_FEE', quantity: round(-netValue * 0.0015), currency: CCY, chargedAt: at.toISOString() }],
      },
    },
  };
}

function pieSummary(id: number, invested: number, coef: number, divs: number): PieSummary {
  return {
    id,
    cash: round(rand() * 300),
    progress: round(0.3 + rand() * 0.5, 3),
    status: coef >= 0 ? 'AHEAD' : 'BEHIND',
    dividendDetails: { gained: divs, inCash: round(divs * 0.2), reinvested: round(divs * 0.8) },
    result: {
      priceAvgInvestedValue: invested,
      priceAvgValue: round(invested * (1 + coef)),
      priceAvgResult: round(invested * coef),
      priceAvgResultCoef: coef,
    },
  };
}

function pieDetail(id: number, name: string, tickers: string[], expected: number[]): PieDetail {
  return {
    settings: { id, name, icon: 'Unicorn', goal: 250_000, creationDate: monthsAgo(30).toISOString(), dividendCashAction: 'REINVEST' },
    instruments: tickers.map((ticker, k) => {
      const invested = 10_000 + rand() * 15_000;
      const coef = (rand() - 0.35) * 0.5;
      return {
        ticker,
        expectedShare: expected[k],
        currentShare: round(expected[k] * (0.85 + rand() * 0.3), 4),
        ownedQuantity: round(rand() * 20, 4),
        result: {
          priceAvgInvestedValue: round(invested),
          priceAvgValue: round(invested * (1 + coef)),
          priceAvgResult: round(invested * coef),
          priceAvgResultCoef: round(coef, 4),
        },
        issues: [],
      };
    }),
  };
}

const data = build();

function paginate<T>(items: T[], base: string, url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const cursor = Number(url.searchParams.get('cursor') ?? 0);
  const page = items.slice(cursor, cursor + limit);
  const next = cursor + limit < items.length ? `/api/v0${base}?limit=${limit}&cursor=${cursor + limit}` : null;
  return { items: page, nextPagePath: next };
}

export class MockFetcher implements Fetcher {
  async get<T>(path: string): Promise<T> {
    await new Promise((r) => setTimeout(r, 150));
    const url = new URL(path, 'http://mock');
    const p = url.pathname;
    let body: unknown;
    if (p === '/equity/account/summary') body = data.summary;
    else if (p === '/equity/positions') body = data.positions;
    else if (p === '/equity/pies') body = data.pies;
    else if (p.startsWith('/equity/pies/')) body = data.pieDetails[Number(p.split('/').pop())];
    else if (p === '/equity/history/orders') body = paginate(data.orders, p, url);
    else if (p === '/equity/history/dividends') body = paginate(data.dividends, p, url);
    else if (p === '/equity/history/transactions') body = paginate(data.transactions, p, url);
    else throw new Error(`Mock: neznámý endpoint ${path}`);
    return body as T;
  }
}
