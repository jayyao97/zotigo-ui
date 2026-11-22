import { useFocusEffect } from "@react-navigation/native";
import { createContext, useCallback, useContext, useEffect, type EffectCallback } from "react";

/**
 * Set by a container that stays on screen whatever the navigation does: the
 * iPad sidebar. It borrows the front detail screen's navigation object, which
 * changes on every navigation, so focus effects inside it would stop and
 * restart (reloading lists, restarting animations) each time.
 */
export const AlwaysVisibleContext = createContext(false);

/**
 * `useFocusEffect` for content that may live in the iPad sidebar: runs while
 * the screen is focused, or for as long as it is mounted inside an
 * always-visible container. `effect` must be memoised like for
 * `useFocusEffect`.
 */
export function useVisibleEffect(effect: EffectCallback) {
  const always = useContext(AlwaysVisibleContext);
  useEffect(() => (always ? effect() : undefined), [always, effect]);
  useFocusEffect(useCallback(() => (always ? undefined : effect()), [always, effect]));
}

export function useAlwaysVisible() {
  return useContext(AlwaysVisibleContext);
}
