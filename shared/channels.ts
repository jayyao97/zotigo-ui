export type ChannelOverrideMode = "inherit" | "replace";
export type ChannelProgressMode = "auto" | "cot" | "interactive_card";

export interface ChannelConnection {
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
  created_at: string;
  updated_at: string;
}

export interface ChannelConnectionInput {
  provider: "feishu";
  name: string;
  app_id: string;
  app_secret?: string;
  clear_secret?: boolean;
  enabled: boolean;
  allow_chat_ids: string[];
  owner_sender_ids: string[];
  agent_instructions: string;
  approval_instructions: string;
  review_all_tools: boolean;
  progress_mode: ChannelProgressMode;
}

export interface ChannelSender { id: string; display_name?: string }

export interface ChannelGroup {
  chat_id: string;
  name: string;
  avatar?: string;
  description?: string;
  external?: boolean;
  available: boolean;
  conversation_id: string;
  workspace_id?: string;
  enabled: boolean;
  allowed_sender_ids: string[];
}

export interface ChannelConversation {
  id: string;
  connection_id: string;
  chat_id: string;
  root_id?: string;
  thread_id?: string;
  chat_type: "group" | "p2p";
  chat_name?: string;
  display_name: string;
  session_id?: string;
  workspace_id?: string;
  enabled: boolean;
  allowed_sender_ids: string[];
  observed_senders: ChannelSender[];
  agent_instructions_mode: ChannelOverrideMode;
  agent_instructions: string;
  approval_instructions_mode: ChannelOverrideMode;
  approval_instructions: string;
  review_all_tools?: boolean | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelConversationInput {
  display_name: string;
  session_id: string;
  workspace_id: string;
  enabled: boolean;
  allowed_sender_ids: string[];
  agent_instructions_mode: ChannelOverrideMode;
  agent_instructions: string;
  approval_instructions_mode: ChannelOverrideMode;
  approval_instructions: string;
  review_all_tools?: boolean;
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
