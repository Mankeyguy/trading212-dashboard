import { useMemo, useState, type ReactNode } from 'react';
import type { SyncStatus } from '../../shared/types';
import { dateTime, money, pct } from '../format';

export function Kpi(props: { label: string; value: ReactNode; delta?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="label">{props.label}</div>
      <div className="value tabular">{props.value}</div>
      {props.delta != null && <div className="delta tabular">{props.delta}</div>}
    </div>
  );
}

/** Signed money value with ▲/▼ so the sign never relies on color alone. */
export function PL({ value, currency, percent }: { value: number; currency: string; percent?: number }) {
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : '';
  const arrow = value > 0 ? '▲ ' : value < 0 ? '▼ ' : '';
  return (
    <span className={`${cls} tabular`}>
      {arrow}
      {money(value, currency, { sign: true })}
      {percent != null && Number.isFinite(percent) && <> ({pct(percent, { sign: true })})</>}
    </span>
  );
}

export function PctChange({ value }: { value: number }) {
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : '';
  return <span className={`${cls} tabular`}>{pct(value, { sign: true })}</span>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'warn'; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function SyncInfo({ status, onSync }: { status?: SyncStatus; onSync: () => void }) {
  if (!status) return null;
  return (
    <div className="filters muted">
      {status.running ? (
        <span>
          <span className="spinner" /> Stahuji historii… ({status.itemCount} položek)
        </span>
      ) : status.complete ? (
        <span>{status.itemCount} položek · synchronizováno {status.lastSyncAt ? dateTime(status.lastSyncAt) : '–'}</span>
      ) : (
        <span>Historie ještě není kompletní ({status.itemCount} položek)</span>
      )}
      <button className="btn" onClick={onSync} disabled={status.running}>
        Synchronizovat
      </button>
    </div>
  );
}

export function HistoryNotice({ status }: { status?: SyncStatus }) {
  if (!status) return null;
  if (status.lastError) return <Alert>Synchronizace selhala: {status.lastError}</Alert>;
  if (!status.complete)
    return (
      <Alert kind="warn">
        Historie se stahuje postupně (Trading 212 povoluje jen 6 dotazů za minutu). Čísla níže se budou doplňovat –
        stránka se sama obnovuje.
      </Alert>
    );
  return null;
}

// ---------- sortable, paged table ----------

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string;
  num?: boolean;
}

export function DataTable<T>(props: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  empty?: string;
}) {
  const [sort, setSort] = useState(props.initialSort);
  const [limit, setLimit] = useState(props.pageSize ?? 50);

  const sorted = useMemo(() => {
    const col = props.columns.find((c) => c.key === sort?.key);
    if (!col?.sort || !sort) return props.rows;
    const get = col.sort;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...props.rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'cs')) * dir;
    });
  }, [props.rows, props.columns, sort]);

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.num ? 'desc' : 'asc' }));
  };

  if (!props.rows.length) return <div className="empty">{props.empty ?? 'Žádná data'}</div>;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {props.columns.map((c) => (
                <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`} onClick={() => toggle(c)}>
                  {c.label}
                  {sort?.key === c.key && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r) => (
              <tr key={props.rowKey(r)}>
                {props.columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : ''}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <div className="more">
          <button className="btn" onClick={() => setLimit((l) => l + 100)}>
            Zobrazit další ({sorted.length - limit})
          </button>
        </div>
      )}
    </>
  );
}

// ---------- chart helpers ----------

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export const axisProps = {
  stroke: 'var(--text-3)',
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--grid)' },
} as const;

interface TipPayload {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Recharts tooltip content: header + one row per series, values formatted as money. */
export function ChartTip(props: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  currency: string;
  labelFormat?: (l: string) => string;
}) {
  if (!props.active || !props.payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="h">{props.labelFormat ? props.labelFormat(String(props.label)) : props.label}</div>
      {props.payload.map((p) => (
        <div className="row" key={String(p.dataKey)}>
          <span className="k">
            <span className="swatch" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="v">{money(Number(p.value), props.currency)}</span>
        </div>
      ))}
    </div>
  );
}
