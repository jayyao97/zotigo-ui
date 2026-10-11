import { formatCompactTokenCount } from "@zotigo/shared/turnDuration";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { approvalPolicyLabel } from "@zotigo/shared/approvalPolicy";
export function eventLabel(item: DisplayItem): string {
  switch (item.type) {
    case "profile_changed":
      return `Profile changed to ${item.profile?.to ?? "profile"}`;
    case "profile_change_failed":
      return `Profile change to ${item.profile?.to ?? "profile"} failed`;
    case "approval_policy_changed":
      return `Access changed to ${approvalPolicyLabel(item.approval_policy?.to ?? null)}`;
    case "interaction_response":
      return item.interaction?.status === "expired"
        ? "Question expired"
        : "Answered question";
    case "approval_decision": {
      const denied = item.approval?.decisions?.filter((d) => !d.approved) ?? [];
      return !denied.length
        ? ""
        : `${denied.length === 1 ? "Tool call denied" : `${denied.length} tool calls denied`}${denied[0].reason ? ` · ${denied[0].reason}` : ""}`;
    }
    case "approval_request":
    case "interaction_request":
      return "";
    case "context_compacted":
      return item.context_compaction
        ? `Context compacted · ${formatCompactTokenCount(item.context_compaction.original_tokens)} → ${formatCompactTokenCount(item.context_compaction.compressed_tokens)}`
        : "Context compacted";
    case "session_command":
      return item.command?.type === "message"
        ? "Message queued"
        : item.command?.type === "pause"
          ? `Pause requested${item.command.reason ? ` · ${item.command.reason}` : ""}`
          : "Session command";
    case "turn_failed":
      return item.error
        ? ""
        : (item.turn?.reason ?? "This turn failed. Please try again.");
    case "error":
      return "";
    default:
      return item.turn?.status ?? "";
  }
}
