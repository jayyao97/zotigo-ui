import type { CSSProperties } from "react";
import type { ZotigoSession } from "../../shared/zotigod";
import { formatCompactTokenCount } from "./ConversationTimeline";

export function ContextUsageBadge({ usage }: { usage: NonNullable<ZotigoSession["context_usage"]> }) {
  const ratio = usage.window > 0 ? Math.max(0, usage.tokens / usage.window) : 0;
  const percent = Math.round(ratio * 100);
  const estimate = usage.source === "estimate" || usage.source === "provider_estimate";
  return (
    <span className="context-usage-badge" tabIndex={0} aria-label={`Context window ${percent}% used${estimate ? " (estimated)" : ""}`}>
      <span className="context-usage-ring" style={{ "--context-used": `${Math.min(1, ratio) * 360}deg` } as CSSProperties} />
      {percent}%
      <span className="context-usage-tooltip" role="tooltip">
        <span>Context window:</span>
        <strong>{percent}% used{ratio > 1 ? " · over limit" : ""}</strong>
        <small>{estimate ? "≈ " : ""}{formatCompactTokenCount(usage.tokens)} tokens used, {formatCompactTokenCount(usage.window)} total</small>
        {estimate && <small>{usage.source === "provider_estimate" ? "API input + estimated additions" : "Local estimate"}</small>}
      </span>
    </span>
  );
}
