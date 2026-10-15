// Types mirroring the Trading 212 Public API v0 responses (only fields the dashboard uses).

export interface Instrument {
  ticker: string;
  name: string;
  isin: string;
  currency: string;
}

export interface AccountSummary {
  id: number;
  currency: string;
  totalValue: number;
  cash: {
    availableToTrade: number;
    inPies: number;
    reservedForOrders: number;
  };
  investments: {
    currentValue: number;
    totalCost: number;
    realizedProfitLoss: number;
    unrealizedProfitLoss: number;
  };
}

export interface Position {
  instrument: Instrument;
  quantity: number;
  quantityAvailableForTrading: number;
  quantityInPies: number;
  averagePricePaid: number; // instrument currency
  currentPrice: number; // instrument currency
  createdAt: string;
  walletImpact: {
    currency: string; // account currency
    currentValue: number;
    totalCost: number;
    unrealizedProfitLoss: number;
    fxImpact: number;
  };
}

export interface Tax {
  name: string;
  quantity: number;
  currency: string;
  chargedAt: string;
}

export interface HistoricalOrder {
  order: {
    id: number;
    ticker: string;
    instrument?: Instrument;
    side: 'BUY' | 'SELL';
    type: string;
    status: string;
    strategy?: string;
    quantity?: number;
    value?: number;
    filledQuantity?: number;
    filledValue?: number;
    limitPrice?: number;
    stopPrice?: number;
    currency?: string;
    initiatedFrom?: string;
    createdAt: string;
  };
  fill?: {
    id: number;
    filledAt: string;
    price: number;
    quantity: number;
    type: string;
    walletImpact?: {
      currency: string;
      fxRate: number;
      netValue: number;
      realisedProfitLoss: number;
      taxes?: Tax[];
    };
  };
}

export interface DividendItem {
  reference: string;
  ticker: string;
  instrument?: Instrument;
  amount: number; // account currency
  amountInEuro: number;
  currency: string;
  grossAmountPerShare: number;
  tickerCurrency: string;
  quantity: number;
  paidOn: string;
  type: string;
}

export interface TransactionItem {
  reference: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'FEE' | 'TRANSFER' | string;
  amount: number;
  currency: string;
  dateTime: string;
}

export interface InvestmentResult {
  priceAvgInvestedValue: number;
  priceAvgValue: number;
  priceAvgResult: number;
  priceAvgResultCoef: number;
}

export interface PieSummary {
  id: number;
  cash: number;
  progress: number;
  status: 'AHEAD' | 'ON_TRACK' | 'BEHIND' | null;
  dividendDetails: { gained: number; inCash: number; reinvested: number };
  result: InvestmentResult;
}

export interface PieDetail {
  instruments: {
    ticker: string;
    currentShare: number;
    expectedShare: number;
    ownedQuantity: number;
    result: InvestmentResult;
    issues?: { name: string; severity: string }[];
  }[];
  settings: {
    id: number;
    name: string;
    icon?: string;
    goal?: number;
    creationDate?: string;
    endDate?: string;
    dividendCashAction?: string;
  };
}

// ---- Dashboard API (our server -> browser) ----

export type HistoryKind = 'orders' | 'dividends' | 'transactions';

export interface SyncStatus {
  running: boolean;
  complete: boolean; // whole history downloaded at least once
  itemCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface HistoryResponse<T> {
  items: T[];
  status: SyncStatus;
}

export interface PieWithDetail extends PieSummary {
  detail: PieDetail | null;
}

export interface ConfigResponse {
  env: 'live' | 'demo';
  mock: boolean;
  configured: boolean;
}
