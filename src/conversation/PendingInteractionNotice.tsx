import { MessageCircleQuestion } from "lucide-react";
import { useLocale } from "../i18n";
import { t } from "../../shared/i18n";
import { pendingHumanRequestIDs } from "../../shared/sessionDisplay";
import type { DisplayItem } from "../../shared/zotigod";

export function PendingInteractionNotice({ items, onOpen }: {
  items: DisplayItem[];
  onOpen: (interactionId: string) => void;
}) {
  useLocale();
  const pending = pendingHumanRequestIDs(items).interactions;
  const requests = items.filter(item => item.type === "interaction_request" && item.interaction && pending.has(item.interaction.id));
  const first = requests.find(item => item.interaction?.is_blocking) ?? requests[0];
  if (!first?.interaction) return null;
  const interaction = first.interaction;
  return <div className="pending-interaction-notice">
    <MessageCircleQuestion size={18} aria-hidden="true" />
    <div role="status">
      <strong>{interaction.is_blocking ? t("interaction.waitingForAnswer") : t("interaction.answerWhileWorking")}</strong>
      <span>{t("interaction.pendingCount", { count: pending.size })}</span>
    </div>
    <button type="button" onClick={() => onOpen(interaction.id)}>{t("interaction.viewQuestions")}</button>
  </div>;
}
