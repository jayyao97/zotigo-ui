import { t } from "./i18n/index";
import type { RequestContext } from "./zotigod";

export function formatChannelOrigin(context: RequestContext | undefined): string | undefined {
  if (!context) return undefined;
  const source = context.source === "feishu" ? t("channelsPage.feishu") : context.source;
  const conversation = context.conversation_name || context.external_conversation_id;
  const sender = context.actor.display_name || context.actor.id;
  const actorRole = context.actor.role === "owner" ? t("channelOrigin.owner") : undefined;
  return [source, conversation, sender, actorRole].filter(Boolean).join(" · ") || undefined;
}
