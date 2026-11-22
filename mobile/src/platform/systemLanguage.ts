import type { Locale } from "@zotigo/shared/i18n/index";

/**
 * Makes system screens (camera, photo and file pickers, permission prompts)
 * use the app's language. Only iOS needs this; see `systemLanguage.ios.ts`.
 */
export function setSystemLanguage(_locale: Locale): void {}
