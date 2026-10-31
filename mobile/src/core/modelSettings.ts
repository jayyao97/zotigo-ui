import { t } from "@zotigo/shared/i18n/index";
import type { ModelProfile } from "@zotigo/shared/modelSettings";

// Native fields have no HTML form validity checks. Match the desktop constraints.
export function modelDraftError(profile: ModelProfile): string | undefined {
  if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(profile.name)) return t("models.nameHelp");
  if (!profile.model.trim() || profile.model.length > 256) return t("models.modelError");
  if (profile.base_url) {
    try {
      const url = new URL(profile.base_url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return t("models.connection");
    } catch { return t("models.connection"); }
  }
  if (!Number.isInteger(profile.context_window) || profile.context_window < 0 || profile.context_window > 100000000
    || (profile.max_output_tokens !== null && (!Number.isInteger(profile.max_output_tokens) || profile.max_output_tokens < 1 || profile.max_output_tokens > 100000000))) return t("mobile.invalidTokenLimit");
}
