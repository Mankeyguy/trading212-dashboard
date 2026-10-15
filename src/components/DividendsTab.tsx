import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DividendItem } from '../../shared/types';
import type { HistoryState } from '../App';
import { dividendsLast12m, monthRange, sumBy } from '../calc';
import { date, money, monthKey, monthLabel, num, pct, shortTicker } from '../format';
import { axisProps, ChartTip, DataTable, HistoryNotice, Kpi, SyncInfo, type Column } from './ui';

const RANGES = [
  { id: 12, label: '12 měs.' },
  { id: 24, label: '24 měs.' },
  { id: 0, label: 'Vše' },
];

export function DividendsTab({ currency, history }: { currency: string; history: HistoryState<DividendItem> }) {
  const items = history.data?.items ?? [];
  const [range, setRange] = useState(24);
  const [groupBy, setGroupBy] = useState<'month' | 'year'>('month');

  const total = sumBy(items, (d) => d.amount);
  const last12 = dividendsLast12m(items);

  const series = useMemo(() => {
    if (!items.length) return [];
    const byMonth = new Map<string, number>();
    for (const d of items) byMonth.set(monthKey(d.paidOn), (byMonth.get(monthKey(d.paidOn)) ?? 0) + d.amount);
    const first = items.reduce((min, d) => (d.paidOn < min ? d.paidOn : min), items[0].paidOn);
    let months = monthRange(monthKey(first)).map((m) => ({ key: m, amount: byMonth.get(m) ?? 0 }));
    if (groupBy === 'year') {
      const byYear = new Map<string, number>();
      for (const m of months) byYear.set(m.key.slice(0, 4), (byYear.get(m.key.slice(0, 4)) ?? 0) + m.amount);
      return [...byYear.entries()].map(([key, amount]) => ({ key, amount }));
    }
    if (range) months = months.slice(-range);
    return months;
  }, [items, range, groupBy]);

  const payers = useMemo(() => {
    const m = new Map<string, { ticker: string; name: string; amount: number; count: number; last: string }>();
    for (const d of items) {
      const e = m.get(d.ticker) ?? { ticker: d.ticker, name: d.instrument?.name ?? d.ticker, amount: 0, count: 0, last: d.paidOn };
      e.amount += d.amount;
      e.count++;
      if (d.paidOn > e.last) e.last = d.paidOn;
      m.set(d.ticker, e);
    }
    return [...m.values()];
  }, [items]);

  const payerCols: Column<(typeof payers)[number]>[] = [
    { key: 't', label: 'Instrument', sort: (r) => r.ticker, render: (r) => <div className="instr"><span className="t">{shortTicker(r.ticker)}</span><span className="n">{r.name}</span></div> },
    { key: 'a', label: 'Celkem', num: true, sort: (r) => r.amount, render: (r) => money(r.amount, currency) },
    { key: 's', label: 'Podíl', num: true, sort: (r) => r.amount, render: (r) => pct(r.amount / total, { digits: 1 }) },
    { key: 'c', label: 'Výplat', num: true, sort: (r) => r.count, render: (r) => r.count },
    { key: 'l', label: 'Poslední', num: true, sort: (r) => r.last, render: (r) => date(r.last) },
  ];

  const listCols: Column<DividendItem>[] = [
    { key: 'd', label: 'Datum', sort: (d) => d.paidOn, render: (d) => date(d.paidOn) },
    { key: 't', label: 'Instrument', sort: (d) => d.ticker, render: (d) => <div className="instr"><span className="t">{shortTicker(d.ticker)}</span><span className="n">{d.instrument?.name}</span></div> },
    { key: 'q', label: 'Počet akcií', num: true, sort: (d) => d.quantity, render: (d) => num(d.quantity, 4) },
    { key: 'g', label: 'Hrubá/akcie', num: true, sort: (d) => d.grossAmountPerShare, render: (d) => money(d.grossAmountPerShare, d.tickerCurrency || 'USD') },
    { key: 'a', label: 'Vyplaceno', num: true, sort: (d) => d.amount, render: (d) => money(d.amount, currency) },
    { key: 'ty', label: 'Typ', sort: (d) => d.type, render: (d) => <span className="muted">{d.type}</span> },
  ];

  return (
    <>
      <HistoryNotice status={history.data?.status} />
      <div className="grid kpis">
        <Kpi label="Dividendy celkem" value={money(total, currency)} />
        <Kpi label="Posledních 12 měsíců" value={money(last12, currency)} delta={<span className="muted">≈ {money(last12 / 12, currency)} měsíčně</span>} />
        <Kpi label="Počet výplat" value={items.length} delta={<span className="muted">z {payers.length} instrumentů</span>} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Dividendy {groupBy === 'month' ? 'po měsících' : 'po letech'}</h2>
            <p className="sub">Částky po srážkové dani, v měně účtu</p>
          </div>
          <div className="filters">
            <div className="seg">
              <button className={groupBy === 'month' ? 'active' : ''} onClick={() => setGroupBy('month')}>Měsíce</button>
              <button className={groupBy === 'year' ? 'active' : ''} onClick={() => setGroupBy('year')}>Roky</button>
            </div>
            {groupBy === 'month' && (
              <div className="seg">
                {RANGES.map((r) => (
                  <button key={r.id} className={range === r.id ? 'active' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {series.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="key" tickFormatter={groupBy === 'month' ? monthLabel : undefined} minTickGap={8} {...axisProps} />
              <YAxis tickFormatter={(v) => money(v, currency, { compact: true })} width={80} {...axisProps} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip currency={currency} labelFormat={groupBy === 'month' ? monthLabel : undefined} />} />
              <Bar dataKey="amount" name="Dividendy" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty">Zatím žádné dividendy</div>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Kdo platí nejvíc</h2>
          <p className="sub">Součet dividend podle instrumentu</p>
          <DataTable rows={payers} columns={payerCols} rowKey={(r) => r.ticker} initialSort={{ key: 'a', dir: 'desc' }} pageSize={15} />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Všechny výplaty</h2>
            </div>
            <SyncInfo status={history.data?.status} onSync={history.sync} />
          </div>
          <DataTable rows={items} columns={listCols} rowKey={(d) => d.reference} initialSort={{ key: 'd', dir: 'desc' }} pageSize={25} />
        </div>
      </div>
    </>
  );
}
