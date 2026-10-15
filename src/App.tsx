import { useEffect, useState } from 'react';
import type {
  AccountSummary,
  ConfigResponse,
  DividendItem,
  HistoricalOrder,
  HistoryKind,
  HistoryResponse,
  PieWithDetail,
  Position,
  TransactionItem,
} from '../shared/types';
import { getJson, useApi } from './api';
import { DividendsTab } from './components/DividendsTab';
import { OrdersTab } from './components/OrdersTab';
import { OverviewTab } from './components/OverviewTab';
import { PiesTab } from './components/PiesTab';
import { PositionsTab } from './components/PositionsTab';
import { TaxTab } from './components/TaxTab';
import { TransactionsTab } from './components/TransactionsTab';
import { Alert } from './components/ui';

const TABS = [
  { id: 'overview', label: 'Přehled' },
  { id: 'positions', label: 'Pozice' },
  { id: 'dividends', label: 'Dividendy' },
  { id: 'transactions', label: 'Vklady a výběry' },
  { id: 'orders', label: 'Objednávky' },
  { id: 'pies', label: 'Pies' },
  { id: 'tax', label: 'Daně' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function useHistory<T>(kind: HistoryKind) {
  const [running, setRunning] = useState(true);
  const state = useApi<HistoryResponse<T>>(`/api/history/${kind}`, running ? 5_000 : 120_000);
  useEffect(() => {
    if (state.data) setRunning(state.data.status.running || !state.data.status.complete);
  }, [state.data]);
  const sync = () =>
    getJson(`/api/history/${kind}/sync`, { method: 'POST' }).then(() => {
      setRunning(true);
      state.reload();
    });
  return { ...state, sync };
}
export type HistoryState<T> = ReturnType<typeof useHistory<T>>;

const initialTab = (): TabId => {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'overview';
};

export function App() {
  const [tab, setTab] = useState<TabId>(initialTab);
  const config = useApi<ConfigResponse>('/api/config');
  const summary = useApi<AccountSummary>('/api/summary', 30_000);
  const positions = useApi<Position[]>('/api/positions', 30_000);
  const pies = useApi<PieWithDetail[]>('/api/pies', 15_000);
  const orders = useHistory<HistoricalOrder>('orders');
  const dividends = useHistory<DividendItem>('dividends');
  const transactions = useHistory<TransactionItem>('transactions');

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
  }, [tab]);
  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const currency = summary.data?.currency ?? positions.data?.[0]?.walletImpact.currency ?? 'EUR';
  const refreshAll = () => {
    summary.reload();
    positions.reload();
    pies.reload();
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Trading 212 Dashboard</h1>
        {config.data &&
          (config.data.mock ? (
            <span className="badge mock">Ukázková data</span>
          ) : (
            <span className={`badge ${config.data.env === 'live' ? 'live' : ''}`}>
              {config.data.env === 'live' ? 'Live účet' : 'Demo účet'}
            </span>
          ))}
        {summary.data && <span className="muted">#{summary.data.id} · {summary.data.currency}</span>}
        <span className="spacer" />
        <button className="btn" onClick={refreshAll} disabled={summary.loading}>
          {summary.loading ? 'Načítám…' : 'Obnovit'}
        </button>
      </header>

      {config.data && !config.data.configured && (
        <Alert>
          Server nemá nastavený API klíč. Zkopíruj <code>.env.example</code> do <code>.env</code>, doplň{' '}
          <code>T212_API_KEY</code> (a <code>T212_API_SECRET</code>) a restartuj <code>npm run dev</code>.
        </Alert>
      )}
      {config.data?.configured && (summary.error || positions.error) && (
        <Alert>{summary.error ?? positions.error}</Alert>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          currency={currency}
          summary={summary.data}
          positions={positions.data ?? []}
          dividends={dividends.data?.items ?? []}
          transactions={transactions.data?.items ?? []}
          historyStatus={transactions.data?.status}
        />
      )}
      {tab === 'positions' && <PositionsTab currency={currency} positions={positions.data ?? []} summary={summary.data} />}
      {tab === 'dividends' && <DividendsTab currency={currency} history={dividends} />}
      {tab === 'transactions' && <TransactionsTab currency={currency} history={transactions} />}
      {tab === 'orders' && <OrdersTab currency={currency} history={orders} />}
      {tab === 'pies' && <PiesTab currency={currency} pies={pies} positions={positions.data ?? []} />}
      {tab === 'tax' && <TaxTab currency={currency} orders={orders} positions={positions.data ?? []} />}
    </div>
  );
}
