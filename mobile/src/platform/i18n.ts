import { useSyncExternalStore } from "react";
import { getLocale, isLocale, localeStorageKey, setLocale, subscribeLocale, type Locale } from "@zotigo/shared/i18n/index";
import { storage } from "./storage";
import { setSystemLanguage } from "./systemLanguage";

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "en");
}
export async function initializeLanguage(): Promise<void> {
  const saved = await storage.get(localeStorageKey);
  const locale = isLocale(saved) ? saved : "en";
  setLocale(locale);
  setSystemLanguage(locale);
}
export async function changeLanguage(locale: Locale): Promise<void> {
  await storage.set(localeStorageKey, locale);
  setLocale(locale);
  setSystemLanguage(locale);
}
