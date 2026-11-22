import type { DisplayItem } from "./zotigod";
import { t } from "./i18n/index";

export function requestRetryLabel(item: DisplayItem, now: number): string {
  const retry = item.retry;
  if (!retry) return "";
  const waiting = !retry.status || retry.status === "waiting";
  const seconds = Math.max(0, Math.ceil((Date.parse(item.created_at) + retry.delay_ms - now) / 1000));
  return waiting && seconds > 0
    ? t("conversationTimeline.requestRetry", { attempt: retry.attempt, seconds })
    : retry.status === "recovered" ? t("retry.recovered", { attempt: retry.attempt, count: retry.attempt })
    : retry.status === "failed" ? t("retry.failed", { attempt: retry.attempt, count: retry.attempt })
    : retry.status === "context_recovery" ? t("retry.contextRecovery")
    : retry.status === "canceled" ? t("retry.canceled")
    : t("retry.running", { attempt: retry.attempt });
}
