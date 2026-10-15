import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoricalOrder, Position } from '../../shared/types';
import type { HistoryState } from '../App';
import { date, money, monthLabel, num, shortTicker } from '../format';
import {
  analyzeTaxes,
  releaseSchedule,
  TAX_RATE,
  TIME_TEST_YEARS,
  VALUE_TEST_FROM_YEAR,
  VALUE_TEST_LIMIT,
  type InstrumentTax,
  type Lot,
  type YearSales,
} from '../tax';
import { Alert, axisProps, DataTable, HistoryNotice, Kpi, PL, type Column } from './ui';

const DAY = 86_400_000;
const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / DAY);
const taxOf = (gain: number) => Math.max(0, gain) * TAX_RATE;

export function TaxTab({ currency, orders, positions }: { currency: string; orders: HistoryState<HistoricalOrder>; positions: Position[] }) {
  const [granularity, setGranularity] = useState<'year' | 'month'>('year');
  const [lotTicker, setLotTicker] = useState('');
  const [lotStatus, setLotStatus] = useState<'' | 'passed' | 'locked'>('');

  const tax = useMemo(() => analyzeTaxes(orders.data?.items ?? [], positions), [orders.data, positions]);
  const status = orders.data?.status;
  const thisYear = new Date().getFullYear();

  const passedValue = sum(tax.instruments, (i) => i.passedValue);
  const passedGain = sum(tax.instruments, (i) => i.passedGain);
  const lockedValue = sum(tax.instruments, (i) => i.lockedValue);
  const lockedGain = sum(tax.instruments, (i) => i.lockedGain);

  const current: YearSales = tax.years.find((y) => y.year === thisYear) ?? {
    year: thisYear, grossProceeds: 0, exemptByTimeProceeds: 0, taxableProceeds: 0, taxableCost: 0, taxableGain: 0,
    valueTestApplies: thisYear >= VALUE_TEST_FROM_YEAR, valueTestPassed: thisYear >= VALUE_TEST_FROM_YEAR,
  };
  const valueRoom = Math.max(0, VALUE_TEST_LIMIT - current.grossProceeds);
  // "Sell everything not yet tax-free today": taxable gain this year = already realized + locked gain.
  const sellAllGross = current.grossProceeds + lockedValue + passedValue;
  const sellAllTaxableGain = current.taxableGain + lockedGain;
  const sellAllExemptByValue = current.valueTestApplies && sellAllGross <= VALUE_TEST_LIMIT;
  const sellAllTax = sellAllExemptByValue ? 0 : taxOf(sellAllTaxableGain);

  const schedule = useMemo(() => {
    let rows = releaseSchedule(tax.lots, granularity);
    if (granularity === 'month') rows = rows.slice(0, 36);
    let cumulative = passedValue;
    return rows.map((r) => {
      cumulative += r.value;
      return { ...r, gain: r.value - r.cost, cumulative, tickers: [...new Set(r.lots.map((l) => shortTicker(l.ticker)))] };
    });
  }, [tax.lots, granularity, passedValue]);

  const lots = tax.lots.filter((l) => (!lotTicker || l.ticker === lotTicker) && (!lotStatus || (lotStatus === 'passed') === l.passed));
  const periodLabel = (k: string) => (granularity === 'month' ? monthLabel(k) : k);

  const instCols: Column<InstrumentTax>[] = [
    {
      key: 't',
      label: 'Instrument',
      sort: (i) => i.ticker,
      render: (i) => (
        <div className="instr">
          <span className="t">{shortTicker(i.ticker)}{i.warning ? ' ⚠' : ''}</span>
          <span className="n" title={i.warning ?? i.name}>{i.name}</span>
        </div>
      ),
    },
    { key: 'pq', label: 'Prošlo ks', num: true, sort: (i) => i.passedQty, render: (i) => (i.passedQty ? num(i.passedQty, 4) : <span className="muted">–</span>) },
    { key: 'pv', label: 'Volně prodejné za', num: true, sort: (i) => i.passedValue, render: (i) => (i.passedValue ? <strong>{money(i.passedValue, currency)}</strong> : <span className="muted">–</span>) },
    { key: 'pg', label: 'Osvobozený zisk', num: true, sort: (i) => i.passedGain, render: (i) => (i.passedQty ? <PL value={i.passedGain} currency={currency} /> : <span className="muted">–</span>) },
    { key: 'lq', label: 'V testu ks', num: true, sort: (i) => i.lockedQty, render: (i) => (i.lockedQty ? num(i.lockedQty, 4) : <span className="muted">–</span>) },
    { key: 'lv', label: 'Hodnota v testu', num: true, sort: (i) => i.lockedValue, render: (i) => (i.lockedValue ? money(i.lockedValue, currency) : <span className="muted">–</span>) },
    { key: 'lg', label: 'Zdanitelný zisk', num: true, sort: (i) => i.lockedGain, render: (i) => (i.lockedQty ? <PL value={i.lockedGain} currency={currency} /> : <span className="muted">–</span>) },
    { key: 'tx', label: 'Daň 15 % dnes', num: true, sort: (i) => taxOf(i.lockedGain), render: (i) => (taxOf(i.lockedGain) ? money(taxOf(i.lockedGain), currency) : <span className="muted">0</span>) },
    {
      key: 'nf',
      label: 'Další uvolnění',
      num: true,
      sort: (i) => i.nextFree?.getTime() ?? Infinity,
      render: (i) => (i.nextFree ? <span title={`za ${daysUntil(i.nextFree)} dní`}>{i.nextFree.toLocaleDateString('cs-CZ')}</span> : <span className="muted">vše volné</span>),
    },
  ];

  const lotCols: Column<Lot>[] = [
    { key: 'a', label: 'Nakoupeno', sort: (l) => l.acquiredAt, render: (l) => date(l.acquiredAt) },
    { key: 't', label: 'Instrument', sort: (l) => l.ticker, render: (l) => <span className="t"><strong>{shortTicker(l.ticker)}</strong> <span className="muted">{l.name}</span></span> },
    { key: 'q', label: 'Kusů', num: true, sort: (l) => l.quantity, render: (l) => num(l.quantity, 6) },
    { key: 'c', label: 'Nákupní cena', num: true, sort: (l) => l.cost, render: (l) => money(l.cost, currency) },
    { key: 'v', label: 'Hodnota dnes', num: true, sort: (l) => l.value, render: (l) => money(l.value, currency) },
    { key: 'g', label: 'Zisk/ztráta', num: true, sort: (l) => l.value - l.cost, render: (l) => <PL value={l.value - l.cost} currency={currency} /> },
    { key: 'f', label: 'Bez daně od', num: true, sort: (l) => l.freeFrom.getTime(), render: (l) => l.freeFrom.toLocaleDateString('cs-CZ') },
    {
      key: 's',
      label: 'Stav',
      sort: (l) => (l.passed ? 0 : daysUntil(l.freeFrom)),
      render: (l) => (l.passed ? <span className="side BUY">✓ PROŠLO</span> : <span className="muted">⏳ za {daysUntil(l.freeFrom)} dní</span>),
    },
  ];

  const yearCols: Column<YearSales>[] = [
    { key: 'y', label: 'Rok', sort: (y) => y.year, render: (y) => <strong>{y.year}</strong> },
    { key: 'g', label: 'Hrubé příjmy z prodejů', num: true, sort: (y) => y.grossProceeds, render: (y) => money(y.grossProceeds, currency) },
    { key: 'e', label: 'Osvobozeno časovým testem', num: true, sort: (y) => y.exemptByTimeProceeds, render: (y) => money(y.exemptByTimeProceeds, currency) },
    { key: 'tp', label: 'Zdanitelné příjmy', num: true, sort: (y) => y.taxableProceeds, render: (y) => money(y.taxableProceeds, currency) },
    { key: 'tc', label: 'Nákupní cena', num: true, sort: (y) => y.taxableCost, render: (y) => money(y.taxableCost, currency) },
    { key: 'tg', label: 'Zdanitelný zisk', num: true, sort: (y) => y.taxableGain, render: (y) => <PL value={y.taxableGain} currency={currency} /> },
    {
      key: 'v',
      label: 'Hodnotový test',
      sort: (y) => (y.valueTestPassed ? 1 : 0),
      render: (y) => (!y.valueTestApplies ? <span className="muted">neplatil</span> : y.valueTestPassed ? <span className="pos">✓ splněn</span> : <span className="neg">✗ překročen</span>),
    },
    {
      key: 'd',
      label: 'Odhad daně',
      num: true,
      sort: (y) => (y.valueTestPassed ? 0 : taxOf(y.taxableGain)),
      render: (y) => money(y.valueTestPassed ? 0 : taxOf(y.taxableGain), currency),
    },
  ];

  const tickers = [...new Set(tax.lots.map((l) => l.ticker))].sort();

  return (
    <>
      <HistoryNotice status={status} />
      <Alert kind="warn">
        Orientační výpočet podle českých pravidel (časový test {TIME_TEST_YEARS} roky, hodnotový test {money(VALUE_TEST_LIMIT, 'CZK', { compact: true })} od roku {VALUE_TEST_FROM_YEAR}, sazba 15 %), párování nákupů a prodejů metodou FIFO. Nejde o daňové poradenství. Před podáním přiznání si výsledky ověř.
      </Alert>
      {tax.warnings.map((w) => <Alert key={w}>{w}</Alert>)}

      <div className="grid kpis">
        <Kpi label="Prošlo časovým testem" value={money(passedValue, currency)} delta={<span className="muted">osvobozený zisk <PL value={passedGain} currency={currency} /></span>} />
        <Kpi label="Čeká na časový test" value={money(lockedValue, currency)} delta={<span className="muted">zdanitelný zisk <PL value={lockedGain} currency={currency} /></span>} />
        <Kpi
          label={`Hodnotový test ${thisYear}`}
          value={current.valueTestApplies ? money(valueRoom, currency) : '–'}
          delta={<span className="muted">{current.valueTestApplies ? `zbývá z limitu; prodáno ${money(current.grossProceeds, currency)}` : `platí až od ${VALUE_TEST_FROM_YEAR}`}</span>}
        />
        <Kpi
          label="Daň, kdybych dnes prodal vše"
          value={money(sellAllTax, currency)}
          delta={<span className="muted">{sellAllExemptByValue ? 'vešlo by se do hodnotového testu' : `15 % ze zisku ${money(Math.max(0, sellAllTaxableGain), currency)}`}</span>}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Hodnotový test {thisYear}</h2>
        <p className="sub">
          Pokud hrubé příjmy z prodeje cenných papírů za rok nepřesáhnou {money(VALUE_TEST_LIMIT, 'CZK')}, jsou osvobozené bez ohledu na dobu držení. Při překročení se zdaní všechny prodeje, které neprošly časovým testem (nejen částka nad limit).
          Limit se počítá ze všech brokerů dohromady, tady vidíš jen Trading 212.
        </p>
        {current.valueTestApplies ? (
          <>
            <div className="progress" style={{ height: 10 }}>
              <span style={{ width: `${Math.min(100, (current.grossProceeds / VALUE_TEST_LIMIT) * 100)}%`, background: current.grossProceeds > VALUE_TEST_LIMIT ? 'var(--bad)' : 'var(--series-1)' }} />
            </div>
            <div className="filters muted">
              <span>Prodáno: <strong>{money(current.grossProceeds, currency)}</strong></span>
              <span>·</span>
              <span>Limit: {money(VALUE_TEST_LIMIT, currency)}</span>
              <span>·</span>
              <span>{current.grossProceeds > VALUE_TEST_LIMIT ? <span className="neg">Limit překročen o {money(current.grossProceeds - VALUE_TEST_LIMIT, currency)}</span> : <>Letos můžeš ještě prodat za <strong>{money(valueRoom, currency)}</strong> bez daně</>}</span>
            </div>
          </>
        ) : (
          <div className="muted">Hodnotový test platí od roku {VALUE_TEST_FROM_YEAR}.</div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Kalendář uvolňování</h2>
            <p className="sub">Hodnota kusů, které v daném období projdou časovým testem (v dnešních cenách)</p>
          </div>
          <div className="seg">
            <button className={granularity === 'year' ? 'active' : ''} onClick={() => setGranularity('year')}>Roky</button>
            <button className={granularity === 'month' ? 'active' : ''} onClick={() => setGranularity('month')}>Měsíce</button>
          </div>
        </div>
        {schedule.length ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={schedule} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="key" tickFormatter={periodLabel} minTickGap={8} {...axisProps} />
                <YAxis tickFormatter={(v) => money(v, currency, { compact: true })} width={80} {...axisProps} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={({ active, payload }) => {
                    const r = active ? (payload?.[0]?.payload as (typeof schedule)[number] | undefined) : undefined;
                    return r ? (
                      <div className="chart-tip">
                        <div className="h">{periodLabel(r.key)}</div>
                        <div className="row"><span className="k">Uvolní se</span><span className="v">{money(r.value, currency)}</span></div>
                        <div className="row"><span className="k">Zisk v nich</span><span className="v">{money(r.gain, currency, { sign: true })}</span></div>
                        <div className="row"><span className="k">Kumulativně volné</span><span className="v">{money(r.cumulative, currency)}</span></div>
                        <div className="muted" style={{ marginTop: 4, maxWidth: 220, whiteSpace: 'normal' }}>{r.tickers.join(', ')}</div>
                      </div>
                    ) : null;
                  }}
                />
                <Bar dataKey="value" name="Uvolní se" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>{granularity === 'year' ? 'Rok' : 'Měsíc'}</th>
                    <th className="num">Uvolní se za</th>
                    <th className="num">Zisk v nich</th>
                    <th className="num">Kumulativně volně prodejné</th>
                    <th>Instrumenty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Již teď</strong></td>
                    <td className="num">{money(passedValue, currency)}</td>
                    <td className="num"><PL value={passedGain} currency={currency} /></td>
                    <td className="num">{money(passedValue, currency)}</td>
                    <td className="muted" style={{ whiteSpace: 'normal', minWidth: 220 }}>{tax.instruments.filter((i) => i.passedQty).map((i) => shortTicker(i.ticker)).join(', ') || '–'}</td>
                  </tr>
                  {schedule.map((r) => (
                    <tr key={r.key}>
                      <td>{periodLabel(r.key)}</td>
                      <td className="num">{money(r.value, currency)}</td>
                      <td className="num"><PL value={r.gain} currency={currency} /></td>
                      <td className="num">{money(r.cumulative, currency)}</td>
                      <td className="muted" style={{ whiteSpace: 'normal', minWidth: 220 }}>{r.tickers.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty">Všechny držené kusy už časovým testem prošly.</div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Podle instrumentů</h2>
        <p className="sub">„Volně prodejné za“ = aktuální hodnota kusů, které můžeš prodat bez daně. Daň 15 % dnes = odhad, kdybys dnes prodal kusy v testu (bez započtení ostatních prodejů).</p>
        <DataTable rows={tax.instruments} columns={instCols} rowKey={(i) => i.ticker} initialSort={{ key: 'pv', dir: 'desc' }} pageSize={200} empty="Žádné otevřené pozice" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Nákupní loty (FIFO)</h2>
            <p className="sub">Zbývající kusy z jednotlivých nákupů po odečtení prodejů</p>
          </div>
          <div className="filters">
            <select value={lotTicker} onChange={(e) => setLotTicker(e.target.value)}>
              <option value="">Všechny instrumenty</option>
              {tickers.map((t) => <option key={t} value={t}>{shortTicker(t)}</option>)}
            </select>
            <div className="seg">
              {([['', 'Vše'], ['passed', 'Prošlo'], ['locked', 'V testu']] as const).map(([v, l]) => (
                <button key={v} className={lotStatus === v ? 'active' : ''} onClick={() => setLotStatus(v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <DataTable rows={lots} columns={lotCols} rowKey={(l) => `${l.ticker}-${l.acquiredAt}`} initialSort={{ key: 'f', dir: 'asc' }} pageSize={50} empty="Žádné loty" />
      </div>

      <div className="card">
        <h2>Prodeje podle let</h2>
        <p className="sub">Podklad pro daňové přiznání (§ 10). Ztráty a zisky z prodejů, které neprošly časovým testem, se v rámci roku sčítají.</p>
        <DataTable rows={tax.years} columns={yearCols} rowKey={(y) => String(y.year)} initialSort={{ key: 'y', dir: 'desc' }} empty="Zatím žádné prodeje" />
      </div>
    </>
  );
}

function sum<T>(items: T[], f: (x: T) => number) {
  return items.reduce((s, x) => s + f(x), 0);
}
