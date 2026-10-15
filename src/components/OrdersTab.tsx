import { useMemo, useState } from 'react';
import type { HistoricalOrder } from '../../shared/types';
import type { HistoryState } from '../App';
import { sumBy } from '../calc';
import { dateTime, money, num, shortTicker } from '../format';
import { DataTable, HistoryNotice, Kpi, PL, SyncInfo, type Column } from './ui';

const when = (o: HistoricalOrder) => o.fill?.filledAt ?? o.order.createdAt;
const fees = (o: HistoricalOrder) => sumBy(o.fill?.walletImpact?.taxes ?? [], (t) => Math.abs(t.quantity));
const value = (o: HistoricalOrder) => Math.abs(o.fill?.walletImpact?.netValue ?? 0);

export function OrdersTab({ currency, history }: { currency: string; history: HistoryState<HistoricalOrder> }) {
  const all = history.data?.items ?? [];
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'' | 'BUY' | 'SELL'>('');
  const [year, setYear] = useState('');
  const [filledOnly, setFilledOnly] = useState(true);

  const years = useMemo(() => [...new Set(all.map((o) => when(o).slice(0, 4)))].sort().reverse(), [all]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (o) =>
        (!filledOnly || o.fill) &&
        (!side || o.order.side === side) &&
        (!year || when(o).startsWith(year)) &&
        (!q || o.order.ticker.toLowerCase().includes(q) || (o.order.instrument?.name ?? '').toLowerCase().includes(q)),
    );
  }, [all, query, side, year, filledOnly]);

  const filled = rows.filter((o) => o.fill);
  const bought = sumBy(filled.filter((o) => o.order.side === 'BUY'), value);
  const sold = sumBy(filled.filter((o) => o.order.side === 'SELL'), value);
  const realized = sumBy(filled, (o) => o.fill?.walletImpact?.realisedProfitLoss ?? 0);
  const totalFees = sumBy(filled, fees);

  const cols: Column<HistoricalOrder>[] = [
    { key: 'd', label: 'Datum', sort: when, render: (o) => dateTime(when(o)) },
    {
      key: 't',
      label: 'Instrument',
      sort: (o) => o.order.ticker,
      render: (o) => (
        <div className="instr">
          <span className="t">{shortTicker(o.order.ticker)}</span>
          <span className="n">{o.order.instrument?.name}</span>
        </div>
      ),
    },
    { key: 's', label: 'Směr', sort: (o) => o.order.side, render: (o) => <span className={`side ${o.order.side}`}>{o.order.side === 'BUY' ? 'NÁKUP' : 'PRODEJ'}</span> },
    { key: 'ty', label: 'Typ', sort: (o) => o.order.type, render: (o) => <span className="muted">{o.order.type}{o.fill && o.fill.type !== 'TRADE' ? ` · ${o.fill.type}` : ''}</span> },
    { key: 'q', label: 'Počet', num: true, sort: (o) => o.fill?.quantity ?? 0, render: (o) => num(Math.abs(o.fill?.quantity ?? o.order.filledQuantity ?? o.order.quantity ?? 0), 6) },
    { key: 'p', label: 'Cena', num: true, sort: (o) => o.fill?.price ?? 0, render: (o) => (o.fill ? money(o.fill.price, o.order.instrument?.currency ?? o.order.currency ?? currency) : '–') },
    { key: 'v', label: `Hodnota (${currency})`, num: true, sort: value, render: (o) => (o.fill ? money(value(o), o.fill.walletImpact?.currency ?? currency) : '–') },
    { key: 'f', label: 'Poplatky', num: true, sort: fees, render: (o) => (fees(o) ? money(fees(o), currency) : <span className="muted">–</span>) },
    {
      key: 'pl',
      label: 'Realizovaný Z/Z',
      num: true,
      sort: (o) => o.fill?.walletImpact?.realisedProfitLoss ?? 0,
      render: (o) => (o.fill?.walletImpact?.realisedProfitLoss ? <PL value={o.fill.walletImpact.realisedProfitLoss} currency={currency} /> : <span className="muted">–</span>),
    },
    { key: 'st', label: 'Stav', sort: (o) => o.order.status, render: (o) => <span className="muted">{o.order.status}{o.order.initiatedFrom ? ` · ${o.order.initiatedFrom}` : ''}</span> },
  ];

  return (
    <>
      <HistoryNotice status={history.data?.status} />
      <div className="grid kpis">
        <Kpi label="Nakoupeno" value={money(bought, currency)} delta={<span className="muted">{filled.filter((o) => o.order.side === 'BUY').length} obchodů</span>} />
        <Kpi label="Prodáno" value={money(sold, currency)} delta={<span className="muted">{filled.filter((o) => o.order.side === 'SELL').length} obchodů</span>} />
        <Kpi label="Realizovaný zisk/ztráta" value={<PL value={realized} currency={currency} />} />
        <Kpi label="Poplatky (FX, transakční)" value={money(totalFees, currency)} />
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>Souhrny výše odpovídají aktuálním filtrům.</p>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Historie objednávek</h2>
          </div>
          <SyncInfo status={history.data?.status} onSync={history.sync} />
        </div>
        <div className="filters" style={{ marginBottom: 12 }}>
          <input placeholder="Hledat ticker / název" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="seg">
            {(['', 'BUY', 'SELL'] as const).map((s) => (
              <button key={s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>{s === '' ? 'Vše' : s === 'BUY' ? 'Nákupy' : 'Prodeje'}</button>
            ))}
          </div>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Všechny roky</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={filledOnly} onChange={(e) => setFilledOnly(e.target.checked)} /> Jen vyplněné
          </label>
        </div>
        <DataTable rows={rows} columns={cols} rowKey={(o) => `${o.order.id}-${o.fill?.id ?? ''}`} initialSort={{ key: 'd', dir: 'desc' }} pageSize={50} />
      </div>
    </>
  );
}
