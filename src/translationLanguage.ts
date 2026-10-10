import { useState } from "react";
export type TranslationLanguage = "zh-CN" | "en";
export function useTranslationLanguage(host: string): [TranslationLanguage, (value: TranslationLanguage) => void] {
  const [values, setValues] = useState<Record<string, TranslationLanguage>>({});
  const key = `zotigo.translation-language:${host}`;
  let saved: TranslationLanguage = "zh-CN";
  try { if (localStorage.getItem(key) === "en") saved = "en"; } catch { /* In-memory fallback. */ }
  return [values[host] ?? saved, value => {
    setValues(previous => ({ ...previous, [host]: value }));
    try { localStorage.setItem(key, value); } catch { /* In-memory fallback. */ }
  }];
}

export function useTranslationProfile(host: string): [string, (value: string) => void] {
  const [values, setValues] = useState<Record<string, string>>({});
  const key = `zotigo.translation-profile:${host}`;
  let saved = "";
  try { saved = localStorage.getItem(key) ?? ""; } catch { /* In-memory fallback. */ }
  return [values[host] ?? saved, value => {
    setValues(previous => ({ ...previous, [host]: value }));
    try { localStorage.setItem(key, value); } catch { /* In-memory fallback. */ }
  }];
}
