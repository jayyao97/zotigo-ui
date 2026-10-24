import { en, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";

export type Locale = "en" | "zh-CN";
export type { MessageKey };
export const localeStorageKey = "zotigo:ui-language";
const catalogs = { en, "zh-CN": zhCN };
let locale: Locale = "en";
const listeners = new Set<() => void>();
export function getLocale(): Locale { return locale; }
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function isLocale(value: unknown): value is Locale { return value === "en" || value === "zh-CN"; }
export function setLocale(next: Locale): void {
  if (!isLocale(next)) return;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (next === locale) return;
  locale = next;
  for (const listener of listeners) listener();
}
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const message = catalogs[locale][key];
  const template = typeof message === "string" ? message
    : message[new Intl.PluralRules(locale).select(Number(params.count ?? 0)) === "one" ? "one" : "other"];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}
