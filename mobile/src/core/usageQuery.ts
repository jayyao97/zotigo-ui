import type { UsageResult } from "@zotigo/shared/usage";

export const usagePollMilliseconds = 60_000;

/** Results by query key, newest last, so returning to a page or a previous filter renders at once. */
export class UsageCache {
  private entries = new Map<string, { value: UsageResult<unknown>; at: number }>();
  constructor(
    private limit = 64,
    private now: () => number = Date.now,
  ) {}
  get(key: string) {
    return this.entries.get(key);
  }
  set(key: string, value: UsageResult<unknown>) {
    this.entries.delete(key);
    this.entries.set(key, { value, at: this.now() });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
  stale(key: string) {
    return this.now() - (this.entries.get(key)?.at ?? 0) >= usagePollMilliseconds;
  }
}

export interface UsageState<T> {
  result?: UsageResult<T>;
  error: string;
  loading: boolean;
}

/**
 * One usage query on one screen. At most one request per key is in flight:
 * coming back to the screen catches up only when nothing is already loading,
 * and a response that lands while the screen is away is shown on return
 * rather than dropped. Only the newest request may change the state.
 */
export class UsageQuery<T> {
  state: UsageState<T>;
  private request = 0;
  private inFlight: string | undefined;
  private focused = false;
  /** The newest request's outcome when it landed while the screen was away. */
  private missed: { key: string; state: UsageState<T> } | undefined;
  constructor(
    private cache: UsageCache,
    key: string,
    private notify: (state: UsageState<T>) => void,
    private errorText: (error: unknown) => string,
  ) {
    this.state = { result: this.cached(key), error: "", loading: true };
  }
  /** A new key, or an explicit refresh: shows the cached result for the key while loading. */
  load(key: string, load: () => Promise<UsageResult<T>>) {
    this.set({ result: this.cached(key) ?? this.state.result, error: "", loading: true });
    this.run(key, load);
  }
  focus(key: string, load: () => Promise<UsageResult<T>>) {
    this.focused = true;
    const missed = this.missed;
    this.missed = undefined;
    if (missed?.key === key) this.set(missed.state);
    // Its response applies when it lands; starting another would only discard it.
    if (this.inFlight !== key && this.cache.stale(key)) this.run(key, load);
  }
  blur() {
    this.focused = false;
  }
  /** A periodic or return-to-app refresh; skipped while a request for the key is still out. */
  poll(key: string, load: () => Promise<UsageResult<T>>, onlyIfStale = false) {
    if (this.inFlight === key || (onlyIfStale && !this.cache.stale(key))) return;
    this.run(key, load);
  }
  private run(key: string, load: () => Promise<UsageResult<T>>) {
    const id = ++this.request;
    this.inFlight = key;
    this.missed = undefined;
    const settle = (state: UsageState<T>) => {
      if (id !== this.request) return;
      this.inFlight = undefined;
      if (this.focused) this.set(state);
      else this.missed = { key, state };
    };
    load().then(
      (value) => {
        this.cache.set(key, value);
        settle({ result: value, error: "", loading: false });
      },
      (error: unknown) => settle({ result: this.state.result, error: this.errorText(error), loading: false }),
    );
  }
  private cached(key: string) {
    return this.cache.get(key)?.value as UsageResult<T> | undefined;
  }
  private set(state: UsageState<T>) {
    this.state = state;
    this.notify(state);
  }
}
