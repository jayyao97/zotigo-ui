import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import type { CSSProperties } from "react";
import type { ZotigoSession } from "../../shared/zotigod";
import { formatCompactTokenCount } from "./ConversationTimeline";

export function ContextUsageBadge({ usage }: { usage: NonNullable<ZotigoSession["context_usage"]> }) {
  useLocale();
  const ratio = usage.window > 0 ? Math.max(0, usage.tokens / usage.window) : 0;
  const percent = Math.round(ratio * 100);
  const estimate = usage.source === "estimate" || usage.source === "provider_estimate";
  return (
    <span className="context-usage-badge" tabIndex={0} aria-label={t("context.usage", { percent, estimate: estimate ? t("context.estimated") : "" })}>
      <span className="context-usage-ring" style={{ "--context-used": `${Math.min(1, ratio) * 360}deg` } as CSSProperties} />
      {percent}{"%"}<span className="context-usage-tooltip" role="tooltip">
        <span>{usage.cached ? t("contextUsageBadge.contextWindowLastKnownUsage") : t("contextUsageBadge.contextWindow")}</span>
        <strong>{t("context.percentUsed", { percent })}{ratio > 1 ? t("contextUsageBadge.overLimit") : ""}</strong>
        <small>{estimate ? "≈ " : ""}{t("context.tokenUsage", { used: formatCompactTokenCount(usage.tokens), total: formatCompactTokenCount(usage.window) })}</small>
        {estimate && <small>{usage.source === "provider_estimate" ? t("contextUsageBadge.apiInputEstimatedAdditions") : t("contextUsageBadge.localEstimate")}</small>}
      </span>
    </span>
  );
}
