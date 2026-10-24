import { useSyncExternalStore } from "react";
import { getLocale, isLocale, localeStorageKey, setLocale, subscribeLocale, type Locale } from "../shared/i18n";

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "en");
}
export function changeLanguage(locale: Locale): void {
  setLocale(locale);
  try { localStorage.setItem(localeStorageKey, locale); } catch { /* Language remains usable without storage. */ }
}
export function initializeLanguage(): () => void {
  try {
    const saved = localStorage.getItem(localeStorageKey);
    setLocale(isLocale(saved) ? saved : "en");
  } catch { setLocale("en"); }
  const onStorage = (event: StorageEvent) => {
    if (event.key === localeStorageKey) setLocale(isLocale(event.newValue) ? event.newValue : "en");
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
