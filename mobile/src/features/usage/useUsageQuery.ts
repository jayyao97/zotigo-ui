import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { UsageResult } from "@zotigo/shared/usage";
import { errorText } from "../../components/ui";

export const usagePollMilliseconds = 60_000;

// Results stay in memory for the app's lifetime so returning to the page or
// to a previous filter renders at once. The key includes the device, and a
// device switch disposes its client, so data from one machine is never shown
// for another.
const cache = new Map<string, { value: UsageResult<unknown>; at: number }>();
const cacheLimit = 64;
function remember(key: string, value: UsageResult<unknown>) {
  cache.delete(key);
  cache.set(key, { value, at: Date.now() });
  while (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
}

export interface UsageState<T> {
  result?: UsageResult<T>;
  error: string;
  loading: boolean;
}

/**
 * Loads one usage query while the screen is focused. It refetches when the
 * key or `revision` changes and every minute while the app is active; the
 * previous result stays on screen during a request so the layout holds.
 */
export function useUsageQuery<T>(key: string, load: () => Promise<UsageResult<T>>, revision: number): UsageState<T> {
  const [state, setState] = useState<UsageState<T>>(() => ({
    result: cache.get(key)?.value as UsageResult<T> | undefined,
    error: "",
    loading: true,
  }));
  const loadRef = useRef(load);
  loadRef.current = load;
  const request = useRef(0);
  const focused = useRef(false);
  const run = useCallback((target: string, silent = false) => {
    const id = ++request.current;
    if (!silent) setState((current) => ({ ...current, loading: true }));
    loadRef.current().then(
      (value) => {
        remember(target, value);
        if (id === request.current && focused.current) setState({ result: value, error: "", loading: false });
      },
      (error: unknown) => {
        if (id === request.current && focused.current)
          setState((current) => ({ result: current.result, error: errorText(error), loading: false }));
      },
    );
  }, []);
  useEffect(() => {
    const cached = cache.get(key)?.value as UsageResult<T> | undefined;
    setState((current) => ({ result: cached ?? current.result, error: "", loading: true }));
    run(key);
  }, [key, revision, run]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const stale = () => Date.now() - (cache.get(key)?.at ?? 0) >= usagePollMilliseconds;
      // Coming back to the screen or the app catches up once, then polls.
      if (stale()) run(key, true);
      const timer = setInterval(() => {
        if (AppState.currentState === "active") run(key, true);
      }, usagePollMilliseconds);
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active" && stale()) run(key, true);
      });
      return () => {
        focused.current = false;
        request.current++;
        clearInterval(timer);
        subscription.remove();
      };
    }, [key, run]),
  );
  return state;
}
