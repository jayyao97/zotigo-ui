import { useEffect, useState } from "react";
import { storage } from "./storage";
import {
  parseThinkingDisplayMode,
  thinkingDisplayStorageKey,
  type ThinkingDisplayMode,
} from "@zotigo/shared/thinkingDisplay";
import {
  favoriteKey,
  parseModelFavorites,
  type ModelFavorite,
} from "@zotigo/shared/modelFavorites";

const listeners = new Map<string, Set<() => void>>();
function usePreference(key: string) {
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let revision = 0;
    setReady(false);
    const read = () => {
      const version = ++revision;
      void storage
        .get(key)
        .then((value) => {
          if (active && version === revision) {
            setValue(value);
            setReady(true);
          }
        })
        .catch(() => {
          if (active) setError("Could not load preferences.");
        });
    };
    const callbacks = listeners.get(key) ?? new Set<() => void>();
    listeners.set(key, callbacks);
    callbacks.add(read);
    read();
    return () => {
      active = false;
      callbacks.delete(read);
    };
  }, [key]);
  async function save(next: string) {
    setSaving(true);
    try {
      await storage.set(key, next);
      setError("");
      setValue(next);
      listeners.get(key)?.forEach((read) => read());
    } catch {
      setError("Could not save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  return { value, ready: ready && !saving, error, save };
}
export function useThinkingDisplay() {
  const pref = usePreference(thinkingDisplayStorageKey);
  return {
    ...pref,
    mode: parseThinkingDisplayMode(pref.value),
    setMode: (mode: ThinkingDisplayMode) => pref.save(mode),
  };
}
export function useModelFavorites(host: string) {
  const pref = usePreference(`zotigo.model-favorites.v1:${host}`);
  const items = parseModelFavorites(pref.value);
  return {
    ...pref,
    items,
    toggle: (favorite: ModelFavorite) =>
      pref.save(
        JSON.stringify(
          items.some((item) => favoriteKey(item) === favoriteKey(favorite))
            ? items.filter(
                (item) => favoriteKey(item) !== favoriteKey(favorite),
              )
            : [...items, favorite],
        ),
      ),
  };
}

export function useTranslationSettings(host: string) {
  const language = usePreference(`zotigo.translation-language:${host}`);
  const profile = usePreference(`zotigo.translation-profile:${host}`);
  return {
    language: language.value === "en" ? ("en" as const) : ("zh-CN" as const),
    profile: profile.value ?? "",
    ready: language.ready && profile.ready,
    error: language.error || profile.error,
    setLanguage: (value: "zh-CN" | "en") => language.save(value),
    setProfile: (value: string) => profile.save(value),
  };
}
