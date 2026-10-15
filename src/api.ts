import { useCallback, useEffect, useRef, useState } from 'react';

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetches `url`, optionally re-polling every `pollMs`. Keeps last good data on error. */
export function useApi<T>(url: string, pollMs?: number | false, refreshToken = 0): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    getJson<T>(url)
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive.current && setError(e.message))
      .finally(() => alive.current && setLoading(false));
  }, [url]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = pollMs ? setInterval(load, pollMs) : undefined;
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, pollMs, refreshToken]);

  return { data, error, loading, reload: load };
}
