import type { DisplayItem } from "./zotigod";
import { pendingHumanRequestIDs } from "./sessionDisplay";

// A historical window alone cannot prove that a question is still actionable.
export function interactionState(item: DisplayItem, history: DisplayItem[], authoritative: boolean, pending = pendingHumanRequestIDs(history).interactions): boolean | undefined {
  if (!authoritative || !item.interaction?.id) return undefined;
  if (pending.has(item.interaction.id)) return true;
  if (history.some(candidate => candidate.sequence > item.sequence && (
    (candidate.type === "interaction_response" && candidate.interaction?.id === item.interaction?.id)
    || candidate.type === "turn_completed" || candidate.type === "turn_failed" || candidate.type === "turn_interrupted"
  ))) return false;
  return undefined;
}
