import { useSyncExternalStore } from "react";
import { getLocale, isLocale, localeStorageKey, setLocale, subscribeLocale, type Locale } from "@zotigo/shared/i18n/index";
import { storage } from "./storage";

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "en");
}
export async function initializeLanguage(): Promise<void> {
  const saved = await storage.get(localeStorageKey);
  setLocale(isLocale(saved) ? saved : "en");
}
export async function changeLanguage(locale: Locale): Promise<void> {
  await storage.set(localeStorageKey, locale);
  setLocale(locale);
}
