// Incremental download of paginated history endpoints into local JSON files.
//
// History endpoints allow only 6 requests/min with max 50 items per page, so a
// long account history takes minutes to download. We therefore:
//  - persist everything we have to data/history-<kind>.json,
//  - on each sync walk from the newest page until we meet an item we already know,
//  - if the very first full download was interrupted, continue from the saved cursor.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Fetcher } from './t212.js';
import type { DividendItem, HistoricalOrder, HistoryKind, SyncStatus, TransactionItem } from '../shared/types.js';

interface Page<T> {
  items: T[];
  nextPagePath: string | null;
}

interface Store {
  items: unknown[];
  complete: boolean;
  resumePath: string | null;
  lastSyncAt: string | null;
}

const KIND_CONFIG: Record<HistoryKind, { key: (item: any) => string; date: (item: any) => string }> = {
  orders: {
    key: (o: HistoricalOrder) => `${o.order.id}-${o.fill?.id ?? ''}`,
    date: (o: HistoricalOrder) => o.fill?.filledAt ?? o.order.createdAt,
  },
  dividends: {
    key: (d: DividendItem) => d.reference ?? `${d.ticker}-${d.paidOn}-${d.amount}`,
    date: (d: DividendItem) => d.paidOn,
  },
  transactions: {
    key: (t: TransactionItem) => t.reference ?? `${t.type}-${t.dateTime}-${t.amount}`,
    date: (t: TransactionItem) => t.dateTime,
  },
};

// nextPagePath comes back as "/api/v0/equity/history/...": strip the prefix our client adds.
const normalizePath = (p: string) => p.replace(/^\/api\/v0/, '');

export class HistorySync {
  private stores = new Map<HistoryKind, Store>();
  private running = new Map<HistoryKind, Promise<void>>();
  private errors = new Map<HistoryKind, string | null>();

  constructor(
    private fetcher: Fetcher,
    private dataDir: string,
  ) {}

  private file(kind: HistoryKind) {
    return path.join(this.dataDir, `history-${kind}.json`);
  }

  private async load(kind: HistoryKind): Promise<Store> {
    let store = this.stores.get(kind);
    if (store) return store;
    try {
      store = JSON.parse(await readFile(this.file(kind), 'utf8')) as Store;
    } catch {
      store = { items: [], complete: false, resumePath: null, lastSyncAt: null };
    }
    this.stores.set(kind, store);
    return store;
  }

  private async save(kind: HistoryKind, store: Store) {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.file(kind), JSON.stringify(store));
  }

  async get<T>(kind: HistoryKind): Promise<{ items: T[]; status: SyncStatus }> {
    const store = await this.load(kind);
    const { date } = KIND_CONFIG[kind];
    const items = [...(store.items as T[])].sort((a, b) => date(b).localeCompare(date(a)));
    return { items, status: this.status(kind, store) };
  }

  private status(kind: HistoryKind, store: Store): SyncStatus {
    return {
      running: this.running.has(kind),
      complete: store.complete,
      itemCount: store.items.length,
      lastSyncAt: store.lastSyncAt,
      lastError: this.errors.get(kind) ?? null,
    };
  }

  /** Starts a sync in the background (no-op if one is already running). */
  sync(kind: HistoryKind, opts: { reset?: boolean } = {}): Promise<void> {
    const existing = this.running.get(kind);
    if (existing) return existing;
    const run = this.doSync(kind, !!opts.reset)
      .then(() => void this.errors.set(kind, null))
      .catch((e: Error) => {
        this.errors.set(kind, e.message);
        console.error(`[history:${kind}] sync failed:`, e.message);
      })
      .finally(() => this.running.delete(kind));
    this.running.set(kind, run);
    return run;
  }

  private async doSync(kind: HistoryKind, reset: boolean) {
    const store = await this.load(kind);
    if (reset) Object.assign(store, { items: [], complete: false, resumePath: null });

    const { key } = KIND_CONFIG[kind];
    const known = new Set(store.items.map(key));
    const firstDownload = store.items.length === 0;

    // Phase 1: newest pages until we hit something we already have.
    let next: string | null = `/equity/history/${kind}?limit=50`;
    let reachedEnd = false;
    while (next) {
      const page: Page<unknown> = await this.fetcher.get(next);
      let hitKnown = false;
      for (const item of page.items) {
        const k = key(item);
        if (known.has(k)) hitKnown = true;
        else {
          known.add(k);
          store.items.push(item);
        }
      }
      next = page.nextPagePath ? normalizePath(page.nextPagePath) : null;
      if (!next) reachedEnd = true;
      if (firstDownload) store.resumePath = next;
      await this.save(kind, store);
      console.log(`[history:${kind}] ${store.items.length} items`);
      if (hitKnown) break;
    }

    // Phase 2: an earlier full download was interrupted, continue where it stopped.
    if (!reachedEnd && !store.complete && store.resumePath) {
      next = store.resumePath;
      while (next) {
        const page: Page<unknown> = await this.fetcher.get(next);
        for (const item of page.items) {
          const k = key(item);
          if (!known.has(k)) {
            known.add(k);
            store.items.push(item);
          }
        }
        next = page.nextPagePath ? normalizePath(page.nextPagePath) : null;
        store.resumePath = next;
        await this.save(kind, store);
        console.log(`[history:${kind}] ${store.items.length} items (resuming)`);
      }
      reachedEnd = true;
    }

    if (reachedEnd) {
      store.complete = true;
      store.resumePath = null;
    }
    store.lastSyncAt = new Date().toISOString();
    await this.save(kind, store);
  }
}
