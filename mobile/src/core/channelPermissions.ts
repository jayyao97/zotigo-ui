import { t } from "@zotigo/shared/i18n/index";
import {
  channelProgressDetails,
  type ChannelConnection,
  type ChannelConnectionInput,
  type ChannelConversation,
  type ChannelConversationInput,
  type ChannelProgressDetail,
} from "@zotigo/shared/channels";
export function connectionPermissions(
  value: ChannelConnection,
  policy: "auto" | "bypass_permissions",
): ChannelConnectionInput {
  const {
    provider,
    name,
    app_id,
    enabled,
    allow_chat_ids,
    owner_sender_ids,
    agent_instructions,
    approval_instructions,
    review_all_tools,
    progress_mode,
  } = value;
  return {
    provider,
    name,
    app_id,
    enabled,
    allow_chat_ids,
    owner_sender_ids,
    agent_instructions,
    approval_instructions,
    review_all_tools,
    progress_mode,
    approval_policy: policy,
  };
}
export function conversationPermissions(
  value: ChannelConversation,
  policy: "auto" | "bypass_permissions" | "",
): ChannelConversationInput {
  const {
    display_name,
    session_strategy,
    session_id,
    workspace_id,
    enabled,
    sender_policy,
    allowed_sender_ids,
    agent,
    profile_name,
    model,
    reasoning_effort,
    agent_instructions_mode,
    agent_instructions,
    approval_instructions_mode,
    approval_instructions,
    review_all_tools,
  } = value;
  return {
    display_name,
    session_strategy,
    session_id: session_id ?? "",
    workspace_id: workspace_id ?? "",
    enabled,
    sender_policy: sender_policy ?? "selected",
    allowed_sender_ids,
    agent,
    profile_name,
    model,
    reasoning_effort,
    agent_instructions_mode,
    agent_instructions,
    approval_instructions_mode,
    approval_instructions,
    review_all_tools: review_all_tools ?? undefined,
    approval_policy: policy,
  };
}
export function channelPermissionLabel(policy?: string) {
  return policy === "bypass_permissions" ? t("channelsPage.fullAccess") : t("channelsPage.auto");
}
/**
 * The progress detail a chat sees, as Desktop words it. Mobile shows it
 * without editing (routing is managed on Desktop). Undefined when the daemon
 * predates the setting. The daemon's raw value is shown as is when this
 * client does not know it.
 */
export function channelProgressDetailLabel(
  connection: Pick<ChannelConnection, "progress_detail"> | undefined,
  conversation?: Pick<ChannelConversation, "progress_detail">,
): string | undefined {
  const level = (value: string) =>
    (channelProgressDetails as readonly string[]).includes(value)
      ? t(`channelsPage.progressDetail.${value as ChannelProgressDetail}`)
      : t("channelsPage.progressDetailUnrecognized", { level: value });
  const own = conversation?.progress_detail;
  if (own) return level(own);
  const inherited = connection?.progress_detail;
  if (!inherited) return undefined;
  return conversation ? t("channelsPage.progressDetailInherit", { level: level(inherited) }) : level(inherited);
}
