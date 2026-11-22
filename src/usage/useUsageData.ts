import { useCallback, useEffect, useRef, useState } from "react";
import type { UsageResult } from "../../shared/usage";

export const usagePollMilliseconds = 60_000;

interface CacheEntry { value: UsageResult<unknown>; at: number }

// Results stay in memory for the window's lifetime so returning to the page
// or switching back to a previous time zone renders immediately.
const cache = new Map<string, CacheEntry>();
const cacheLimit = 64;

export function clearUsageCache(): void { cache.clear(); }

function remember(key: string, value: UsageResult<unknown>): void {
  cache.delete(key);
  cache.set(key, { value, at: Date.now() });
  while (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
}

export interface UsageState<T> {
  result?: UsageResult<T>;
  error?: string;
  loading: boolean;
}

/**
 * Loads a usage query keyed by host and parameters. It refetches on key
 * change, on `revision` change, and every minute while the document is
 * visible; the cached or previous result stays visible during the request.
 */
export function useUsageQuery<T>(key: string | null, load: () => Promise<UsageResult<T>>, revision: number): UsageState<T> {
  const [state, setState] = useState<UsageState<T>>(() => {
    const cached = key ? cache.get(key) : undefined;
    return { result: cached?.value as UsageResult<T> | undefined, loading: Boolean(key) };
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  const request = useRef(0);

  // Background polls are silent; only key changes and manual refreshes show loading.
  const run = useCallback((target: string, silent = false) => {
    const id = ++request.current;
    if (!silent) setState(current => ({ ...current, loading: true }));
    loadRef.current().then(value => {
      remember(target, value);
      if (id === request.current) setState({ result: value, loading: false });
    }, (error: unknown) => {
      if (id === request.current) setState(current => ({ result: current.result, error: error instanceof Error ? error.message : String(error), loading: false }));
    });
  }, []);

  useEffect(() => {
    if (!key) { request.current++; setState({ loading: false }); return; }
    const cached = cache.get(key);
    // Keep the previous result on screen until the new one arrives so the
    // layout does not collapse while filters or the period change.
    setState(current => ({ result: (cached?.value as UsageResult<T> | undefined) ?? current.result, loading: true }));
    run(key);
  }, [key, revision, run]);

  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === "visible") timer = setInterval(() => run(key, true), usagePollMilliseconds);
    };
    const visibility = () => {
      // Catch up on return when the data is older than one poll interval.
      const cached = cache.get(key);
      if (document.visibilityState === "visible" && (!cached || Date.now() - cached.at >= usagePollMilliseconds)) run(key, true);
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [key, run]);

  return state;
}
