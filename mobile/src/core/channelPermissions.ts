import type {
  ChannelConnection,
  ChannelConnectionInput,
  ChannelConversation,
  ChannelConversationInput,
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
  return policy === "bypass_permissions" ? "Full access" : "Auto";
}
