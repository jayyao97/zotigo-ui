import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { UsageResult } from "@zotigo/shared/usage";
import { errorText } from "../../components/ui";
import { UsageCache, UsageQuery, usagePollMilliseconds, type UsageState } from "../../core/usageQuery";

export type { UsageState };

// Results stay in memory for the app's lifetime. The key includes the device,
// and a device switch disposes its client, so data from one machine is never
// shown for another.
const cache = new UsageCache();

/**
 * Loads one usage query while the screen is focused. It refetches when the
 * key or `revision` changes and every minute while the app is active; the
 * previous result stays on screen during a request so the layout holds.
 */
export function useUsageQuery<T>(key: string, load: () => Promise<UsageResult<T>>, revision: number): UsageState<T> {
  const [state, setState] = useState<UsageState<T>>();
  const [query] = useState(() => new UsageQuery<T>(cache, key, setState, errorText));
  const loadRef = useRef(load);
  loadRef.current = load;
  const fetch = useCallback(() => loadRef.current(), []);
  // Declared before the focus effect so a new key's request is already out
  // when focus catches up, and is not sent twice.
  useEffect(() => query.load(key, fetch), [key, revision, query, fetch]);
  useFocusEffect(
    useCallback(() => {
      query.focus(key, fetch);
      const timer = setInterval(() => {
        if (AppState.currentState === "active") query.poll(key, fetch);
      }, usagePollMilliseconds);
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active") query.poll(key, fetch, true);
      });
      return () => {
        query.blur();
        clearInterval(timer);
        subscription.remove();
      };
    }, [key, query, fetch]),
  );
  return state ?? query.state;
}
