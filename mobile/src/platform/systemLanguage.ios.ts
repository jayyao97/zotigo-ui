import { requireOptionalNativeModule } from "expo";
import type { Locale } from "@zotigo/shared/i18n/index";

const native = requireOptionalNativeModule<{ setPreferred(language: string): void }>("ZotigoAppLanguage");

/** iOS language IDs for the app's locales; they match the bundle's .lproj names. */
const iosLanguage: Record<Locale, string> = { en: "en", "zh-CN": "zh-Hans" };

/**
 * Makes system screens (camera, photo and file pickers, permission prompts)
 * use the app's language. iOS reads the preference at launch, so a change
 * applies from the next launch.
 */
export function setSystemLanguage(locale: Locale): void {
  native?.setPreferred(iosLanguage[locale]);
}
