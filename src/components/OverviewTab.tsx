import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AccountSummary, DividendItem, Position, SyncStatus, TransactionItem } from '../../shared/types';
import { cumulativeDeposits, dividendsLast12m, sumBy } from '../calc';
import { money, monthLabel, pct, shortTicker } from '../format';
import { axisProps, ChartTip, HistoryNotice, Kpi, PctChange, PL } from './ui';

interface Props {
  currency: string;
  summary: AccountSummary | null;
  positions: Position[];
  dividends: DividendItem[];
  transactions: TransactionItem[];
  historyStatus?: SyncStatus;
}

export function OverviewTab({ currency, summary, positions, dividends, transactions, historyStatus }: Props) {
  const deposits = useMemo(() => cumulativeDeposits(transactions), [transactions]);
  const netDeposits = deposits.at(-1)?.cumulative ?? 0;
  const divTotal = sumBy(dividends, (d) => d.amount);
  const div12 = dividendsLast12m(dividends);

  const allocation = useMemo(() => {
    const total = sumBy(positions, (p) => p.walletImpact.currentValue);
    const sorted = [...positions].sort((a, b) => b.walletImpact.currentValue - a.walletImpact.currentValue);
    const top = sorted.slice(0, 10).map((p) => ({
      name: shortTicker(p.instrument.ticker),
      full: p.instrument.name,
      value: p.walletImpact.currentValue,
      weight: p.walletImpact.currentValue / total,
    }));
    const rest = sorted.slice(10);
    if (rest.length) {
      const v = sumBy(rest, (p) => p.walletImpact.currentValue);
      top.push({ name: `Ostatní (${rest.length})`, full: 'Ostatní pozice', value: v, weight: v / total });
    }
    return top;
  }, [positions]);

  const movers = useMemo(() => {
    const withPct = positions.map((p) => ({
      p,
      pct: p.walletImpact.totalCost ? p.walletImpact.unrealizedProfitLoss / p.walletImpact.totalCost : 0,
    }));
    const byPL = [...withPct].sort((a, b) => b.p.walletImpact.unrealizedProfitLoss - a.p.walletImpact.unrealizedProfitLoss);
    return { best: byPL.slice(0, 5), worst: byPL.slice(-5).reverse().filter((x) => x.p.walletImpact.unrealizedProfitLoss < 0) };
  }, [positions]);

  if (!summary) return <div className="empty">Načítám účet…</div>;
  const inv = summary.investments;
  const unrealizedPct = inv.totalCost ? inv.unrealizedProfitLoss / inv.totalCost : 0;
  const historyComplete = historyStatus?.complete && netDeposits > 0;
  const gainVsDeposits = summary.totalValue - netDeposits;

  return (
    <>
      <HistoryNotice status={historyStatus} />
      <div className="grid kpis">
        <Kpi
          label="Celková hodnota účtu"
          value={money(summary.totalValue, currency)}
          delta={
            historyComplete ? (
              <>
                <PL value={gainVsDeposits} currency={currency} percent={gainVsDeposits / netDeposits} />
                <span className="muted"> oproti vkladům</span>
              </>
            ) : undefined
          }
        />
        <Kpi label="Hodnota investic" value={money(inv.currentValue, currency)} delta={<span className="muted">nákupní cena {money(inv.totalCost, currency)}</span>} />
        <Kpi label="Nerealizovaný zisk" value={<PL value={inv.unrealizedProfitLoss} currency={currency} />} delta={<span className="muted">{pct(unrealizedPct, { sign: true })} z nákupní ceny</span>} />
        <Kpi label="Realizovaný zisk" value={<PL value={inv.realizedProfitLoss} currency={currency} />} delta={<span className="muted">z uzavřených obchodů</span>} />
        <Kpi
          label="Volná hotovost"
          value={money(summary.cash.availableToTrade, currency)}
          delta={<span className="muted">v pies {money(summary.cash.inPies, currency)} · rezervováno {money(summary.cash.reservedForOrders, currency)}</span>}
        />
        <Kpi label="Přijaté dividendy" value={money(divTotal, currency)} delta={<span className="muted">posledních 12 měs. {money(div12, currency)}</span>} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Vložené peníze vs. dnešní hodnota</h2>
          <p className="sub">Kumulativní čisté vklady po měsících; čárkovaně aktuální hodnota účtu</p>
          {deposits.length ? (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={deposits} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} minTickGap={24} {...axisProps} />
                  <YAxis tickFormatter={(v) => money(v, currency, { compact: true })} width={86} {...axisProps} axisLine={false} />
                  <Tooltip content={<ChartTip currency={currency} labelFormat={monthLabel} />} cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 3' }} />
                  <Area type="stepAfter" dataKey="cumulative" name="Čisté vklady" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.12} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
                  <ReferenceLine y={summary.totalValue} stroke="var(--series-2)" strokeWidth={2} strokeDasharray="6 4" ifOverflow="extendDomain" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="legend">
                <span><i className="line" style={{ background: 'var(--series-1)' }} /> Čisté vklady</span>
                <span><i className="dash" style={{ borderColor: 'var(--series-2)' }} /> Hodnota účtu dnes ({money(summary.totalValue, currency, { compact: true })})</span>
              </div>
            </>
          ) : (
            <div className="empty">Čekám na historii transakcí…</div>
          )}
        </div>

        <div className="card">
          <h2>Alokace portfolia</h2>
          <p className="sub">10 největších pozic podle aktuální hodnoty</p>
          {allocation.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, allocation.length * 26 + 20)}>
              <BarChart data={allocation} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={4}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={96} {...axisProps} axisLine={false} tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="chart-tip">
                        <div className="h">{payload[0].payload.full}</div>
                        <div className="row"><span className="k">Hodnota</span><span className="v">{money(payload[0].payload.value, currency)}</span></div>
                        <div className="row"><span className="k">Váha</span><span className="v">{pct(payload[0].payload.weight)}</span></div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="weight" position="right" formatter={(v: unknown) => pct(Number(v), { digits: 1 })} style={{ fill: 'var(--text-2)', fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">Žádné otevřené pozice</div>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <MoversCard title="Největší zisky" rows={movers.best} currency={currency} />
        <MoversCard title="Největší ztráty" rows={movers.worst} currency={currency} />
      </div>
    </>
  );
}

function MoversCard({ title, rows, currency }: { title: string; rows: { p: Position; pct: number }[]; currency: string }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="sub">Nerealizovaný zisk/ztráta otevřených pozic</p>
      {rows.length ? (
        <div className="table-wrap">
        <table>
          <tbody>
            {rows.map(({ p, pct: pc }) => (
              <tr key={p.instrument.ticker}>
                <td>
                  <div className="instr">
                    <span className="t">{shortTicker(p.instrument.ticker)}</span>
                    <span className="n">{p.instrument.name}</span>
                  </div>
                </td>
                <td className="num">
                  <PL value={p.walletImpact.unrealizedProfitLoss} currency={currency} />
                  <div><PctChange value={pc} /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <div className="empty">Nic k zobrazení</div>
      )}
    </div>
  );
}
