import { getLocale, t } from "./i18n/index";
export function formatElapsed(startedAt: string, now: number): string {
  const started = Date.parse(startedAt);
  const seconds = Number.isFinite(started) && Number.isFinite(now) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  if (seconds < 60) return t("time.seconds", { count: seconds });
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? t("conversationTimeline.mS", { p0: minutes, p1: seconds % 60 }) : t("time.minutes", { count: minutes });
}

export function formatCompactTokenCount(tokens: number): string {
  if (tokens < 1_000) return tokens.toLocaleString(getLocale());
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${(tokens / 1_000_000).toFixed(tokens < 10_000_000 ? 1 : 0)}m`;
}
