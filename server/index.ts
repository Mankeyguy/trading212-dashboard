import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistorySync } from './historySync.js';
import { MockFetcher } from './mock.js';
import { T212ApiError, T212Client, type Fetcher } from './t212.js';
import type {
  AccountSummary,
  ConfigResponse,
  HistoryKind,
  PieDetail,
  PieSummary,
  PieWithDetail,
  Position,
} from '../shared/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env.T212_ENV === 'demo' ? 'demo' : 'live';
const mock = process.env.T212_MOCK === '1';
const apiKey = process.env.T212_API_KEY?.trim();
const apiSecret = process.env.T212_API_SECRET?.trim() || undefined;
const port = Number(process.env.PORT ?? 3212);
const host = process.env.HOST ?? '127.0.0.1';
const HISTORY_SYNC_MINUTES = Number(process.env.HISTORY_SYNC_MINUTES ?? 30);

const fetcher: Fetcher | null = mock
  ? new MockFetcher()
  : apiKey
    ? new T212Client({ env, apiKey, apiSecret })
    : null;
const history = fetcher ? new HistorySync(fetcher, path.join(root, 'data', mock ? 'mock' : env)) : null;

// ---- small TTL cache with in-flight de-duplication ----
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

function requireFetcher(): Fetcher {
  if (!fetcher) throw new T212ApiError(503, 'Chybí T212_API_KEY v souboru .env (viz README).');
  return fetcher;
}

// Pie details are rate limited to 1 / 5s, so we refresh them lazily in the background.
const pieDetails = new Map<number, { at: number; detail: PieDetail }>();
const pieDetailsInFlight = new Set<number>();
function refreshPieDetails(ids: number[]) {
  for (const id of ids) {
    const hit = pieDetails.get(id);
    if ((hit && Date.now() - hit.at < 10 * 60_000) || pieDetailsInFlight.has(id)) continue;
    pieDetailsInFlight.add(id);
    requireFetcher()
      .get<PieDetail>(`/equity/pies/${id}`)
      .then((detail) => pieDetails.set(id, { at: Date.now(), detail }))
      .catch((e) => console.error(`[pies] detail ${id} failed:`, e.message))
      .finally(() => pieDetailsInFlight.delete(id));
  }
}

const app = express();
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).then((body) => res.json(body), next);

app.get(
  '/api/config',
  wrap(async (): Promise<ConfigResponse> => ({ env, mock, configured: !!fetcher })),
);

app.get(
  '/api/summary',
  wrap(() => cached('summary', 10_000, () => requireFetcher().get<AccountSummary>('/equity/account/summary'))),
);

app.get(
  '/api/positions',
  wrap(() => cached('positions', 10_000, () => requireFetcher().get<Position[]>('/equity/positions'))),
);

app.get(
  '/api/pies',
  wrap(async (): Promise<PieWithDetail[]> => {
    const pies = await cached('pies', 60_000, () => requireFetcher().get<PieSummary[]>('/equity/pies'));
    refreshPieDetails(pies.map((p) => p.id));
    return pies.map((p) => ({ ...p, detail: pieDetails.get(p.id)?.detail ?? null }));
  }),
);

const KINDS: HistoryKind[] = ['orders', 'dividends', 'transactions'];
const parseKind = (k: string): HistoryKind => {
  if (!KINDS.includes(k as HistoryKind)) throw new T212ApiError(404, 'Neznámý typ historie');
  return k as HistoryKind;
};

app.get(
  '/api/history/:kind',
  wrap(async (req) => {
    requireFetcher();
    return history!.get(parseKind(req.params.kind));
  }),
);

app.post(
  '/api/history/:kind/sync',
  wrap(async (req) => {
    requireFetcher();
    const kind = parseKind(req.params.kind);
    void history!.sync(kind, { reset: req.query.reset === '1' });
    return { started: true };
  }),
);

// Production: serve the built frontend from the same server.
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof T212ApiError ? err.status : 500;
  if (!(err instanceof T212ApiError)) console.error(err);
  res.status(status).json({ error: err.message });
});

app.listen(port, host, () => {
  console.log(`Trading 212 dashboard API na http://${host}:${port} (${mock ? 'MOCK data' : env})`);
  if (!fetcher) console.warn('⚠ Chybí T212_API_KEY – zkopíruj .env.example do .env a doplň klíč.');
  if (history) {
    const syncAll = () => KINDS.forEach((k) => void history.sync(k));
    syncAll();
    setInterval(syncAll, HISTORY_SYNC_MINUTES * 60_000);
  }
});
