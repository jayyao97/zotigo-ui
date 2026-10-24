import { t } from "@zotigo/shared/i18n/index";
import { stateLabel } from "@zotigo/shared/i18n/display";
import { formatCompactTokenCount } from "@zotigo/shared/turnDuration";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { approvalPolicyLabel } from "@zotigo/shared/approvalPolicy";
export function eventLabel(item: DisplayItem): string {
  switch (item.type) {
    case "profile_changed":
      return t("conversationTimeline.profileChangedTo", { p0: item.profile?.to ?? "profile" });
    case "profile_change_failed":
      return t("conversationTimeline.profileChangeToFailed", { p0: item.profile?.to ?? "profile" });
    case "approval_policy_changed":
      return t("mobile.accessChanged", { policy: approvalPolicyLabel(item.approval_policy?.to ?? null) });
    case "interaction_response":
      return item.interaction?.status === "expired"
        ? t("conversationTimeline.questionExpired")
        : t("conversationTimeline.answeredQuestion");
    case "approval_decision": {
      const denied = item.approval?.decisions?.filter((d) => !d.approved) ?? [];
      return !denied.length
        ? ""
        : `${denied.length === 1 ? t("conversationTimeline.toolCallDenied") : t("conversationTimeline.toolCallsDenied", { p0: denied.length })}${denied[0].reason ? ` · ${denied[0].reason}` : ""}`;
    }
    case "approval_request":
    case "interaction_request":
      return "";
    case "context_compacted":
      return item.context_compaction
        ? t("conversationTimeline.contextCompacted", { p0: formatCompactTokenCount(item.context_compaction.original_tokens), p1: formatCompactTokenCount(item.context_compaction.compressed_tokens) })
        : t("conversationTimeline.contextCompacted2");
    case "session_command":
      return item.command?.type === "message"
        ? t("conversationTimeline.messageQueued")
        : item.command?.type === "pause"
          ? item.command.reason ? t("conversationTimeline.pauseRequested", { p0: item.command.reason }) : t("conversationTimeline.pauseRequested2")
          : t("conversationTimeline.sessionCommand");
    case "turn_failed":
      return item.error
        ? ""
        : (item.turn?.reason ?? t("mobile.turnFailed"));
    case "error":
      return "";
    default:
      return stateLabel(item.turn?.status ?? "");
  }
}
