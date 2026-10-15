import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TransactionItem } from '../../shared/types';
import type { HistoryState } from '../App';
import { cumulativeDeposits, sumBy } from '../calc';
import { dateTime, money, monthLabel } from '../format';
import { axisProps, ChartTip, DataTable, HistoryNotice, Kpi, SyncInfo, type Column } from './ui';

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Vklad',
  WITHDRAW: 'Výběr',
  FEE: 'Poplatek',
  TRANSFER: 'Převod',
};

export function TransactionsTab({ currency, history }: { currency: string; history: HistoryState<TransactionItem> }) {
  const items = history.data?.items ?? [];
  const [type, setType] = useState('');
  const monthly = useMemo(() => cumulativeDeposits(items).slice(-24), [items]);

  const deposits = sumBy(items.filter((t) => t.type === 'DEPOSIT'), (t) => Math.abs(t.amount));
  const withdrawals = sumBy(items.filter((t) => t.type === 'WITHDRAW'), (t) => Math.abs(t.amount));
  const fees = sumBy(items.filter((t) => t.type === 'FEE'), (t) => Math.abs(t.amount));
  const types = [...new Set(items.map((t) => t.type))];
  const rows = type ? items.filter((t) => t.type === type) : items;

  const cols: Column<TransactionItem>[] = [
    { key: 'd', label: 'Datum', sort: (t) => t.dateTime, render: (t) => dateTime(t.dateTime) },
    { key: 't', label: 'Typ', sort: (t) => t.type, render: (t) => TYPE_LABEL[t.type] ?? t.type },
    { key: 'a', label: 'Částka', num: true, sort: (t) => t.amount, render: (t) => money(t.amount, t.currency || currency) },
    { key: 'r', label: 'Reference', render: (t) => <span className="muted">{t.reference}</span> },
  ];

  return (
    <>
      <HistoryNotice status={history.data?.status} />
      <div className="grid kpis">
        <Kpi label="Vklady celkem" value={money(deposits, currency)} />
        <Kpi label="Výběry celkem" value={money(withdrawals, currency)} />
        <Kpi label="Čisté vklady" value={money(deposits - withdrawals, currency)} />
        <Kpi label="Poplatky" value={money(fees, currency)} delta={<span className="muted">transakce typu FEE</span>} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Vklady a výběry po měsících</h2>
        <p className="sub">Posledních 24 měsíců</p>
        {monthly.length ? (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} minTickGap={8} {...axisProps} />
                <YAxis tickFormatter={(v) => money(v, currency, { compact: true })} width={80} {...axisProps} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip currency={currency} labelFormat={monthLabel} />} />
                <Bar dataKey="deposits" name="Vklady" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="withdrawals" name="Výběry" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
            <div className="legend">
              <span><i className="swatch" style={{ background: 'var(--series-1)' }} /> Vklady</span>
              <span><i className="swatch" style={{ background: 'var(--series-2)' }} /> Výběry</span>
            </div>
          </>
        ) : (
          <div className="empty">Zatím žádné transakce</div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Všechny transakce</h2>
          </div>
          <div className="filters">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Všechny typy</option>
              {types.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <SyncInfo status={history.data?.status} onSync={history.sync} />
        </div>
        <DataTable rows={rows} columns={cols} rowKey={(t) => t.reference} initialSort={{ key: 'd', dir: 'desc' }} pageSize={50} />
      </div>
    </>
  );
}
