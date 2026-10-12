import { titleFromPrompt } from "@zotigo/shared/conversationTitle";
import type { DaemonClient } from "./client";

export function isPlaceholderTitle(
  title: string | null | undefined,
  prompt: string,
) {
  return !title || title === "New session" || title === titleFromPrompt(prompt);
}

// Re-read after inference: another client may have renamed the session meanwhile.
export async function suggestConversationTitle(
  client: DaemonClient,
  id: string,
  previousTitle: string | null | undefined,
  active: () => boolean,
) {
  const suggestion = await client.suggestTitle(id);
  if (!active()) return;
  if (!suggestion.title?.trim()) throw new Error("Empty title suggestion.");
  const latest = (await client.catalog()).find(
    (row) => (row.organization?.session_id ?? row.runtime?.id) === id,
  );
  if (!active() || !latest || latest.organization?.title !== previousTitle)
    return;
  await client.renameSession(id, suggestion.title);
  return suggestion.title;
}
