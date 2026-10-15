// Thin Trading 212 API client: auth + per-endpoint rate limiting + retry on 429.

export interface Fetcher {
  get<T>(path: string): Promise<T>;
}

const BASE_URLS = {
  live: 'https://live.trading212.com/api/v0',
  demo: 'https://demo.trading212.com/api/v0',
} as const;

// Minimum spacing between calls per endpoint group, from the API's documented limits.
const LIMITS: { match: RegExp; intervalMs: number }[] = [
  { match: /^\/equity\/account\/summary/, intervalMs: 5_000 }, // 1 / 5s
  { match: /^\/equity\/positions/, intervalMs: 1_000 }, // 1 / 1s
  { match: /^\/equity\/history\/orders/, intervalMs: 10_000 }, // 6 / 1min
  { match: /^\/equity\/history\/dividends/, intervalMs: 10_000 },
  { match: /^\/equity\/history\/transactions/, intervalMs: 10_000 },
  { match: /^\/equity\/pies\/\d+/, intervalMs: 5_000 }, // 1 / 5s
  { match: /^\/equity\/pies/, intervalMs: 30_000 }, // 1 / 30s
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class T212ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class T212Client implements Fetcher {
  private baseUrl: string;
  private authHeader: string;
  // Per-group promise chain, so concurrent callers queue up instead of tripping 429s.
  private queues = new Map<string, Promise<unknown>>();
  private nextAllowed = new Map<string, number>();

  constructor(opts: { env: 'live' | 'demo'; apiKey: string; apiSecret?: string }) {
    this.baseUrl = BASE_URLS[opts.env];
    // New keys come as key + secret (HTTP Basic); legacy keys go raw into Authorization.
    this.authHeader = opts.apiSecret
      ? 'Basic ' + Buffer.from(`${opts.apiKey}:${opts.apiSecret}`).toString('base64')
      : opts.apiKey;
  }

  get<T>(path: string): Promise<T> {
    const group = LIMITS.find((l) => l.match.test(path));
    const key = group ? group.match.source : path;
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => this.run<T>(key, group?.intervalMs ?? 1_000, path));
    this.queues.set(key, next);
    return next;
  }

  private async run<T>(key: string, intervalMs: number, path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = (this.nextAllowed.get(key) ?? 0) - Date.now();
      if (wait > 0) await sleep(wait);
      this.nextAllowed.set(key, Date.now() + intervalMs);

      const res = await fetch(this.baseUrl + path, {
        headers: { Authorization: this.authHeader, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429 && attempt < 3) {
        // x-ratelimit-reset is a unix timestamp (seconds) when the window resets.
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const until = reset > 0 ? reset * 1000 - Date.now() + 250 : intervalMs;
        this.nextAllowed.set(key, Date.now() + Math.max(until, 1_000));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new T212ApiError(res.status, describeError(res.status, body));
      }
      return (await res.json()) as T;
    }
  }
}

function describeError(status: number, body: string): string {
  switch (status) {
    case 401:
      return 'Neplatný API klíč (401). Zkontroluj T212_API_KEY / T212_API_SECRET.';
    case 403:
      return 'API klíč nemá potřebné oprávnění (scope) pro tento endpoint (403).';
    case 429:
      return 'Překročen rate limit Trading 212 (429), zkus to za chvíli.';
    default:
      return `Trading 212 API vrátilo ${status}${body ? ': ' + body.slice(0, 200) : ''}`;
  }
}
