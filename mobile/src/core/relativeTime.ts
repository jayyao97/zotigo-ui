import { t } from "@zotigo/shared/i18n/index";
import type { CatalogSessionProjection } from "@zotigo/shared/zotigod";

/** Latest activity timestamp for a catalog session, or "" when none is known. */
export function sessionActivity(item: CatalogSessionProjection): string {
  return (
    [item.runtime?.updated_at, item.organization?.updated_at, item.runtime?.created_at]
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? ""
  );
}

/** Compact age such as "now", "5m", "3h", "2d", then a short date. */
export function compactAge(iso: string, now = Date.now(), locale?: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return t("mobileUi.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("mobileUi.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("mobileUi.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("mobileUi.daysAgo", { count: days });
  return new Date(time).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
