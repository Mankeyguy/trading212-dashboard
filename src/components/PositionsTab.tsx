import { useMemo, useState } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountSummary, Position } from '../../shared/types';
import { sumBy } from '../calc';
import { money, num, pct, shortTicker } from '../format';
import { axisProps, DataTable, Kpi, PctChange, PL, type Column } from './ui';

export function PositionsTab({ currency, positions, summary }: { currency: string; positions: Position[]; summary: AccountSummary | null }) {
  const [query, setQuery] = useState('');
  const total = sumBy(positions, (p) => p.walletImpact.currentValue);
  const fx = sumBy(positions, (p) => p.walletImpact.fxImpact ?? 0);
  const maxValue = Math.max(1, ...positions.map((p) => p.walletImpact.currentValue));
  const winners =positions.filter((p) => p.walletImpact.unrealizedProfitLoss > 0).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return positions.filter((p) => !q || p.instrument.ticker.toLowerCase().includes(q) || p.instrument.name.toLowerCase().includes(q));
  }, [positions, query]);

  const byCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) m.set(p.instrument.currency, (m.get(p.instrument.currency) ?? 0) + p.walletImpact.currentValue);
    return [...m.entries()].map(([name, value]) => ({ name, value, weight: value / total })).sort((a, b) => b.value - a.value);
  }, [positions, total]);

  const plPct = (p: Position) => (p.walletImpact.totalCost ? p.walletImpact.unrealizedProfitLoss / p.walletImpact.totalCost : 0);
  const columns: Column<Position>[] = [
    {
      key: 'ticker',
      label: 'Instrument',
      sort: (p) => p.instrument.ticker,
      render: (p) => (
        <div className="instr">
          <span className="t">{shortTicker(p.instrument.ticker)}</span>
          <span className="n" title={p.instrument.name}>{p.instrument.name}</span>
        </div>
      ),
    },
    { key: 'qty', label: 'Počet', num: true, sort: (p) => p.quantity, render: (p) => num(p.quantity, 6) },
    { key: 'avg', label: 'Prům. cena', num: true, sort: (p) => p.averagePricePaid, render: (p) => money(p.averagePricePaid, p.instrument.currency) },
    { key: 'price', label: 'Aktuální cena', num: true, sort: (p) => p.currentPrice, render: (p) => money(p.currentPrice, p.instrument.currency) },
    { key: 'priceChg', label: 'Změna ceny', num: true, sort: (p) => p.currentPrice / p.averagePricePaid - 1, render: (p) => <PctChange value={p.currentPrice / p.averagePricePaid - 1} /> },
    { key: 'cost', label: 'Investováno', num: true, sort: (p) => p.walletImpact.totalCost, render: (p) => money(p.walletImpact.totalCost, currency) },
    { key: 'value', label: 'Hodnota', num: true, sort: (p) => p.walletImpact.currentValue, render: (p) => money(p.walletImpact.currentValue, currency) },
    { key: 'pl', label: 'Zisk/ztráta', num: true, sort: (p) => p.walletImpact.unrealizedProfitLoss, render: (p) => <PL value={p.walletImpact.unrealizedProfitLoss} currency={currency} /> },
    { key: 'plPct', label: 'Z/Z %', num: true, sort: plPct, render: (p) => <PctChange value={plPct(p)} /> },
    { key: 'fx', label: 'Vliv měny', num: true, sort: (p) => p.walletImpact.fxImpact ?? 0, render: (p) => money(p.walletImpact.fxImpact ?? 0, currency, { sign: true }) },
    {
      key: 'weight',
      label: 'Váha',
      num: true,
      sort: (p) => p.walletImpact.currentValue,
      render: (p) => {
        const w = p.walletImpact.currentValue / total;
        return (
          <>
            {pct(w, { digits: 1 })}
            <span className="weight-bar"><span style={{ width: `${(p.walletImpact.currentValue / maxValue) * 100}%` }} /></span>
          </>
        );
      },
    },
  ];

  return (
    <>
      <div className="grid kpis">
        <Kpi label="Otevřených pozic" value={positions.length} delta={<span className="muted">{winners} v zisku · {positions.length - winners} ve ztrátě</span>} />
        <Kpi label="Hodnota pozic" value={money(total, currency)} />
        <Kpi label="Nerealizovaný zisk" value={<PL value={summary?.investments.unrealizedProfitLoss ?? sumBy(positions, (p) => p.walletImpact.unrealizedProfitLoss)} currency={currency} />} />
        <Kpi label="Vliv měnových kurzů" value={money(fx, currency, { sign: true })} delta={<span className="muted">součást zisku/ztráty</span>} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Otevřené pozice</h2>
            <p className="sub">Ceny v měně instrumentu, hodnoty v měně účtu ({currency}). Klikni na sloupec pro řazení.</p>
          </div>
          <div className="filters">
            <input placeholder="Hledat ticker / název" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <DataTable rows={rows} columns={columns} rowKey={(p) => p.instrument.ticker} initialSort={{ key: 'value', dir: 'desc' }} pageSize={200} empty="Žádné otevřené pozice" />
      </div>

      <div className="card">
        <h2>Expozice podle měny instrumentu</h2>
        <p className="sub">V jaké měně jsou obchodovány tvé investice</p>
        <ResponsiveContainer width="100%" height={byCurrency.length * 30 + 20}>
          <BarChart data={byCurrency} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={48} {...axisProps} axisLine={false} tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="chart-tip">
                    <div className="h">{payload[0].payload.name}</div>
                    <div className="row"><span className="k">Hodnota</span><span className="v">{money(payload[0].payload.value, currency)}</span></div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}>
              <LabelList dataKey="weight" position="right" formatter={(v: unknown) => pct(Number(v), { digits: 1 })} style={{ fill: 'var(--text-2)', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
