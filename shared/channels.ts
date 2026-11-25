import type { AgentKind } from "./zotigod";

export type ChannelOverrideMode = "inherit" | "replace";
export type ChannelProgressMode = "auto" | "cot" | "interactive_card";
export type ChannelSessionStrategy = "topic" | "shared";
export type ChannelChatMode = "group" | "topic";
export type ChannelSenderPolicy = "owners" | "all" | "selected";
/** How much of a run the chat sees: tool kinds, plus arguments and interim text, plus thinking. */
export type ChannelProgressDetail = "brief" | "detailed" | "full";
export const channelProgressDetails: readonly ChannelProgressDetail[] = ["brief", "detailed", "full"];

/** Lets an owner run "/bind <name>" in a group instead of pasting a Session or Workspace ID. */
export interface ChannelBindAlias { name: string; target: string }

export interface ChannelConnection {
  approval_policy?: "auto" | "bypass_permissions" | "";
  id: string;
  provider: "feishu";
  name: string;
  app_id: string;
  has_secret: boolean;
  enabled: boolean;
  status: string;
  last_error?: string;
  bot_open_id?: string;
  bot_name?: string;
  allow_chat_ids: string[];
  owner_sender_ids?: string[];
  agent_instructions: string;
  approval_instructions: string;
  review_all_tools: boolean;
  cot_available: boolean;
  progress_mode: ChannelProgressMode;
  /** Absent when the daemon predates progress detail and bind aliases. */
  progress_detail?: ChannelProgressDetail;
  /** A level from a newer daemon this client does not know; progress_detail is then brief. */
  progress_detail_unrecognized?: string;
  bind_aliases?: ChannelBindAlias[];
  created_at: string;
  updated_at: string;
}

export interface ChannelConnectionInput {
  approval_policy?: "auto" | "bypass_permissions" | "";
  provider: "feishu";
  name: string;
  app_id: string;
  app_secret?: string;
  clear_secret?: boolean;
  enabled: boolean;
  allow_chat_ids: string[];
  owner_sender_ids?: string[];
  agent_instructions: string;
  approval_instructions: string;
  review_all_tools: boolean;
  progress_mode: ChannelProgressMode;
  progress_detail?: ChannelProgressDetail;
  bind_aliases?: ChannelBindAlias[];
}

export interface ChannelSender { id: string; display_name?: string }

export interface ChannelGroup {
  chat_id: string;
  chat_mode?: ChannelChatMode;
  name: string;
  avatar?: string;
  description?: string;
  external?: boolean;
  available: boolean;
  conversation_id: string;
  session_strategy: ChannelSessionStrategy;
  session_id?: string;
  workspace_id?: string;
  enabled: boolean;
  sender_policy?: ChannelSenderPolicy;
  allowed_sender_ids: string[];
  agent: AgentKind;
  profile_name: string;
  model: string;
  reasoning_effort: string;
  /** Empty inherits the connection level. */
  progress_detail?: ChannelProgressDetail | "";
}

export interface ChannelConversation {
  approval_policy?: "auto" | "bypass_permissions" | "";
  id: string;
  connection_id: string;
  chat_id: string;
  root_id?: string;
  thread_id?: string;
  chat_type: "group" | "p2p";
  chat_mode?: ChannelChatMode;
  chat_name?: string;
  display_name: string;
  session_strategy: ChannelSessionStrategy;
  session_id?: string;
  workspace_id?: string;
  enabled: boolean;
  sender_policy?: ChannelSenderPolicy;
  allowed_sender_ids: string[];
  observed_senders: ChannelSender[];
  agent: AgentKind;
  profile_name: string;
  model: string;
  reasoning_effort: string;
  agent_instructions_mode: ChannelOverrideMode;
  agent_instructions: string;
  approval_instructions_mode: ChannelOverrideMode;
  approval_instructions: string;
  review_all_tools?: boolean | null;
  /** Empty inherits the connection level. */
  progress_detail?: ChannelProgressDetail | "";
  /** A level from a newer daemon this client does not know; progress_detail is then empty. */
  progress_detail_unrecognized?: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelConversationInput {
  approval_policy?: "auto" | "bypass_permissions" | "";
  display_name: string;
  session_strategy: ChannelSessionStrategy;
  session_id: string;
  workspace_id: string;
  enabled: boolean;
  sender_policy: ChannelSenderPolicy;
  allowed_sender_ids: string[];
  agent: AgentKind;
  profile_name: string;
  model: string;
  reasoning_effort: string;
  agent_instructions_mode: ChannelOverrideMode;
  agent_instructions: string;
  approval_instructions_mode: ChannelOverrideMode;
  approval_instructions: string;
  review_all_tools?: boolean;
  progress_detail?: ChannelProgressDetail | "";
}

export interface ChannelMessage {
  id: string;
  connection_id: string;
  conversation_id: string;
  provider_message_id: string;
  sender: ChannelSender;
  text: string;
  mentioned_bot: boolean;
  trigger_status: string;
  status_detail?: string;
  reply_message_id?: string;
  delivery_mode?: ChannelProgressMode;
  reply_mode?: "thread" | "direct";
  cot_id?: string;
  final_message_id?: string;
  projected_sequence?: number;
  created_at: string;
}

export function channelGroupName(conversations: ChannelConversation[], chatId: string): string {
  return conversations.find((conversation) => conversation.chat_id === chatId && conversation.chat_type === "group" && !conversation.root_id && conversation.chat_name?.trim())?.chat_name?.trim() || chatId;
}

export function canConfigureChannelGroup(group: ChannelGroup): boolean {
  return Boolean(group.conversation_id);
}
