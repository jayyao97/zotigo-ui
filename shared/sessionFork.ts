import type { DisplayItem } from "./zotigod";

export function createForkRequestId(): string {
  // Remote HTTP test hosts do not expose crypto.randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `fork-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export interface TurnAction {
  turnId: string;
  completed: boolean;
  latest: boolean;
  text: string;
}

/** Build once per transcript update; only the last visible answer in each turn owns its footer. */
export function sessionTurnActions(items: DisplayItem[]): Map<string, TurnAction> {
  const actions = new Map<string, TurnAction>();
  let turnId: string | undefined;
  let answerId: string | undefined;
  let text: string[] = [];
  let completed = false;
  const finish = (latest: boolean) => {
    if (turnId && answerId) actions.set(answerId, { turnId, completed, latest, text: text.join("\n\n") });
  };
  for (const item of items) {
    if (item.subagent) continue;
    if (item.type === "user_message" && item.turn?.id === turnId && turnId) continue;
    if (item.type === "user_message" || item.type === "turn_started") {
      finish(false);
      turnId = item.type === "turn_started" ? item.turn?.id : undefined;
      answerId = undefined;
      text = [];
      completed = false;
    } else if (item.type === "assistant_message") {
      const parts = (item.content ?? []).filter((part) => part.type === "text" && part.text).map((part) => part.text!);
      if (parts.length) { answerId = item.id; text.push(...parts); }
    } else if (item.type === "turn_completed" && (!item.turn?.id || item.turn.id === turnId)) {
      completed = true;
    }
  }
  finish(true);
  return actions;
}
