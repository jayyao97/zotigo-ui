import type { RequestContext } from "./zotigod";

export function formatChannelOrigin(context: RequestContext | undefined): string | undefined {
  if (!context) return undefined;
  const source = context.source === "feishu" ? "Feishu" : context.source;
  const conversation = context.conversation_name || context.external_conversation_id;
  const sender = context.actor.display_name || context.actor.id;
  const actorRole = context.actor.role === "owner" ? "Owner" : undefined;
  return [source, conversation, sender, actorRole].filter(Boolean).join(" · ") || undefined;
}
