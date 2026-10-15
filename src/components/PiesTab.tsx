import type { PieWithDetail, Position } from '../../shared/types';
import type { ApiState } from '../api';
import { sumBy } from '../calc';
import { date, money, num, pct, shortTicker } from '../format';
import { Alert, Kpi, PctChange, PL } from './ui';

const STATUS: Record<string, string> = { AHEAD: 'Před plánem', ON_TRACK: 'Podle plánu', BEHIND: 'Za plánem' };

export function PiesTab({ currency, pies, positions }: { currency: string; pies: ApiState<PieWithDetail[]>; positions: Position[] }) {
  const list = pies.data ?? [];
  const names = new Map(positions.map((p) => [p.instrument.ticker, p.instrument.name]));
  const invested = sumBy(list, (p) => p.result.priceAvgInvestedValue);
  const value = sumBy(list, (p) => p.result.priceAvgValue);
  const result = sumBy(list, (p) => p.result.priceAvgResult);
  const divs = sumBy(list, (p) => p.dividendDetails?.gained ?? 0);
  const loadingDetails = list.some((p) => !p.detail);

  if (pies.error) return <Alert>{pies.error}</Alert>;
  if (!pies.data) return <div className="empty">Načítám pies…</div>;
  if (!list.length) return <div className="empty">Nemáš žádné Pies.</div>;

  return (
    <>
      {loadingDetails && (
        <Alert kind="warn">Detaily pies se načítají postupně (limit 1 dotaz / 5 s). Stránka se obnoví sama.</Alert>
      )}
      <div className="grid kpis">
        <Kpi label="Počet pies" value={list.length} />
        <Kpi label="Investováno" value={money(invested, currency)} />
        <Kpi label="Hodnota" value={money(value, currency)} />
        <Kpi label="Výsledek" value={<PL value={result} currency={currency} percent={invested ? result / invested : undefined} />} />
        <Kpi label="Dividendy v pies" value={money(divs, currency)} />
      </div>

      <div className="grid cols-2">
        {list.map((pie) => (
          <PieCard key={pie.id} pie={pie} currency={currency} names={names} />
        ))}
      </div>
    </>
  );
}

function PieCard({ pie, currency, names }: { pie: PieWithDetail; currency: string; names: Map<string, string> }) {
  const s = pie.detail?.settings;
  const r = pie.result;
  const instruments = [...(pie.detail?.instruments ?? [])].sort((a, b) => b.expectedShare - a.expectedShare);
  return (
    <div className="card pie-card">
      <div className="top">
        <h2>{s?.name ?? `Pie #${pie.id}`}</h2>
        {pie.status && <span className="badge">{STATUS[pie.status] ?? pie.status}</span>}
      </div>
      {s?.goal ? (
        <>
          <div className="muted">
            Cíl {money(s.goal, currency)} · splněno {pct(pie.progress, { digits: 0 })}
            {s.endDate ? ` · do ${date(s.endDate)}` : ''}
          </div>
          <div className="progress"><span style={{ width: `${Math.min(100, pie.progress * 100)}%` }} /></div>
        </>
      ) : null}
      <div className="pie-stats">
        <div><div className="label">Investováno</div><div className="v">{money(r.priceAvgInvestedValue, currency)}</div></div>
        <div><div className="label">Hodnota</div><div className="v">{money(r.priceAvgValue, currency)}</div></div>
        <div><div className="label">Výsledek</div><div className="v"><PL value={r.priceAvgResult} currency={currency} percent={r.priceAvgResultCoef} /></div></div>
        <div><div className="label">Hotovost v pie</div><div className="v">{money(pie.cash, currency)}</div></div>
        <div><div className="label">Dividendy</div><div className="v">{money(pie.dividendDetails?.gained ?? 0, currency)}</div></div>
        {s?.dividendCashAction && (
          <div><div className="label">S dividendami</div><div className="v">{s.dividendCashAction === 'REINVEST' ? 'Reinvestovat' : 'Na účet'}</div></div>
        )}
      </div>

      {pie.detail ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th className="num">Cíl / skutečnost</th>
                <th className="num">Počet</th>
                <th className="num">Hodnota</th>
                <th className="num">Výsledek</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.ticker}>
                  <td>
                    <div className="instr">
                      <span className="t">{shortTicker(i.ticker)}{i.issues?.length ? ' ⚠' : ''}</span>
                      <span className="n" title={i.issues?.map((x) => x.name).join(', ')}>{names.get(i.ticker) ?? i.ticker}</span>
                    </div>
                  </td>
                  <td className="num">
                    <div className="share" style={{ justifyContent: 'flex-end' }} title="Horní pruh: cílový podíl, dolní: skutečný">
                      <span className="tabular">{pct(i.expectedShare, { digits: 0 })} / {pct(i.currentShare, { digits: 1 })}</span>
                      <span className="bars">
                        <span style={{ width: `${i.expectedShare * 100}%`, background: 'var(--other)' }} />
                        <span style={{ width: `${i.currentShare * 100}%`, background: 'var(--series-1)' }} />
                      </span>
                    </div>
                  </td>
                  <td className="num">{num(i.ownedQuantity, 4)}</td>
                  <td className="num">{money(i.result.priceAvgValue, currency)}</td>
                  <td className="num"><PctChange value={i.result.priceAvgResultCoef} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted"><span className="spinner" /> Načítám složení…</div>
      )}
    </div>
  );
}
