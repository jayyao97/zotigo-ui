import type { AgentKind } from "../../shared/zotigod";
import { channelProgressDetails, type ChannelBindAlias, type ChannelConnection, type ChannelConnectionInput, type ChannelConversation, type ChannelConversationInput, type ChannelGroup, type ChannelMessage, type ChannelProgressDetail } from "../../shared/channels";
import { expectRecord, expectArray, expectStringList, expectBoolean, expectString, expectOptionalNumber, expectOptionalString, expectOptionalBoolean } from "./validation";
import { ZotigodRequestError, UnsupportedChannelsError, jsonRequest, requestJSON } from "./http";

export async function listChannelConnections(): Promise<ChannelConnection[]> {
	const value = expectRecord(await requestChannelJSON("/channels/connections", {}, true), "channel connection list");
	return expectArray(value.connections, "channel connections").map((item, index) => parseChannelConnection(item, `channel connections[${index}]`));
}
export function createChannelConnection(input: ChannelConnectionInput): Promise<ChannelConnection> {
	return requestChannelJSON("/channels/connections", jsonRequest("POST", { ...input })).then((value) => parseChannelConnection(value, "created channel connection"));
}
export function updateChannelConnection(id: string, input: ChannelConnectionInput): Promise<ChannelConnection> {
	return requestChannelJSON(`/channels/connections/${encodeURIComponent(id)}`, jsonRequest("PUT", { ...input })).then((value) => parseChannelConnection(value, "updated channel connection"));
}
export function deleteChannelConnection(id: string): Promise<void> {
	return requestChannelJSON(`/channels/connections/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
}
export async function listChannelGroups(connectionId: string): Promise<ChannelGroup[]> {
	const value = expectRecord(await requestChannelJSON(`/channels/connections/${encodeURIComponent(connectionId)}/groups`), "channel group list");
	return expectArray(value.groups, "channel groups").map((item, index) => parseChannelGroup(item, `channel groups[${index}]`));
}
export async function listChannelGroupMembers(connectionId: string, chatId: string): Promise<import("../../shared/channels").ChannelSender[]> {
	const value = expectRecord(await requestChannelJSON(`/channels/connections/${encodeURIComponent(connectionId)}/groups/${encodeURIComponent(chatId)}/members`), "channel group members");
	return expectArray(value.members, "channel group members").map((item, index) => parseChannelSender(item, `channel group members[${index}]`));
}
export async function listChannelConversations(connectionId?: string): Promise<ChannelConversation[]> {
	const query = connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : "";
	const value = expectRecord(await requestChannelJSON(`/channels/conversations${query}`), "channel conversation list");
	return expectArray(value.conversations, "channel conversations").map((item, index) => parseChannelConversation(item, `channel conversations[${index}]`));
}
export function updateChannelConversation(id: string, input: ChannelConversationInput): Promise<ChannelConversation> {
	return requestChannelJSON(`/channels/conversations/${encodeURIComponent(id)}`, jsonRequest("PUT", { ...input })).then((value) => parseChannelConversation(value, "updated channel conversation"));
}
export async function listChannelMessages(conversationId: string): Promise<ChannelMessage[]> {
	const value = expectRecord(await requestChannelJSON(`/channels/conversations/${encodeURIComponent(conversationId)}/messages`), "channel message list");
	return expectArray(value.messages, "channel messages").map((item, index) => parseChannelMessage(item, `channel messages[${index}]`));
}

async function requestChannelJSON(path: string, init: RequestInit = {}, compatibilityProbe = false): Promise<unknown> {
  try {
    return await requestJSON(path, init);
  } catch (error) {
    if (compatibilityProbe && error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) {
      throw new UnsupportedChannelsError();
    }
    throw error;
  }
}

function parseChannelApprovalPolicy(value: unknown): "auto" | "bypass_permissions" | "" | undefined {
  if (value === undefined || value === "" || value === "auto" || value === "bypass_permissions") return value;
  throw new Error("invalid channel approval_policy");
}

function parseChannelConnection(value: unknown, context: string): ChannelConnection {
  const record = expectRecord(value, context);
  const provider = expectString(record.provider, `${context} provider`);
  if (provider !== "feishu") throw new UnsupportedChannelsError(`unsupported provider ${provider}`);
  const progressMode = parseChannelProgressMode(record.progress_mode, `${context} progress_mode`);
  return {
    id: expectString(record.id, `${context} id`), provider, name: expectString(record.name, `${context} name`),
    app_id: expectString(record.app_id, `${context} app_id`), has_secret: expectBoolean(record.has_secret, `${context} has_secret`),
    enabled: expectBoolean(record.enabled, `${context} enabled`), status: expectString(record.status, `${context} status`),
    last_error: expectOptionalString(record.last_error, `${context} last_error`), bot_open_id: expectOptionalString(record.bot_open_id, `${context} bot_open_id`),
    bot_name: expectOptionalString(record.bot_name, `${context} bot_name`), allow_chat_ids: parseChannelStringList(record.allow_chat_ids, `${context} allow_chat_ids`),
    owner_sender_ids: parseChannelStringList(record.owner_sender_ids, `${context} owner_sender_ids`), agent_instructions: expectString(record.agent_instructions, `${context} agent_instructions`),
    approval_instructions: expectString(record.approval_instructions, `${context} approval_instructions`), review_all_tools: expectBoolean(record.review_all_tools, `${context} review_all_tools`),
    approval_policy: parseChannelApprovalPolicy(record.approval_policy),
    cot_available: expectBoolean(record.cot_available, `${context} cot_available`), progress_mode: progressMode,
    progress_detail: parseChannelProgressDetail(record.progress_detail), progress_detail_unrecognized: unrecognizedProgressDetail(record.progress_detail),
    bind_aliases: record.bind_aliases == null ? undefined : expectArray(record.bind_aliases, `${context} bind_aliases`).map((alias, index) => parseChannelBindAlias(alias, `${context} bind_aliases[${index}]`)),
    created_at: expectString(record.created_at, `${context} created_at`), updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseChannelGroup(value: unknown, context: string): ChannelGroup {
  const record = expectRecord(value, context);
  return {
    chat_id: expectString(record.chat_id, `${context} chat_id`), name: expectString(record.name, `${context} name`),
    chat_mode: parseChannelChatMode(record.chat_mode, `${context} chat_mode`),
    avatar: expectOptionalString(record.avatar, `${context} avatar`), description: expectOptionalString(record.description, `${context} description`),
    external: expectOptionalBoolean(record.external, `${context} external`), available: expectBoolean(record.available, `${context} available`),
    conversation_id: expectOptionalString(record.conversation_id, `${context} conversation_id`) ?? "", workspace_id: expectOptionalString(record.workspace_id, `${context} workspace_id`),
    session_strategy: parseChannelSessionStrategy(record.session_strategy, `${context} session_strategy`), session_id: expectOptionalString(record.session_id, `${context} session_id`),
		enabled: expectBoolean(record.enabled, `${context} enabled`), allowed_sender_ids: parseChannelStringList(record.allowed_sender_ids, `${context} allowed_sender_ids`),
		sender_policy: parseChannelSenderPolicy(record.sender_policy, `${context} sender_policy`),
    agent: parseChannelAgent(record.agent, `${context} agent`), profile_name: expectOptionalString(record.profile_name, `${context} profile_name`) ?? "",
    model: expectOptionalString(record.model, `${context} model`) ?? "", reasoning_effort: expectOptionalString(record.reasoning_effort, `${context} reasoning_effort`) ?? "",
    progress_detail: parseChannelProgressDetailOverride(record.progress_detail),
  };
}

const isChannelProgressDetail = (value: unknown): value is ChannelProgressDetail =>
  typeof value === "string" && (channelProgressDetails as readonly string[]).includes(value);

// Daemons without progress detail omit the field, which hides the setting. A
// level this client does not know yet shows as the default instead of
// failing the whole list.
function parseChannelProgressDetail(value: unknown): ChannelProgressDetail | undefined {
  if (value == null) return undefined;
  return isChannelProgressDetail(value) ? value : "brief";
}

// A group without its own level, or with one this client does not know, inherits.
function parseChannelProgressDetailOverride(value: unknown): ChannelProgressDetail | "" {
  return isChannelProgressDetail(value) ? value : "";
}

// Kept so the page can show the level and leave it unchanged on save.
function unrecognizedProgressDetail(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && !isChannelProgressDetail(value) ? value : undefined;
}

function parseChannelBindAlias(value: unknown, context: string): ChannelBindAlias {
  const record = expectRecord(value, context);
  return { name: expectString(record.name, `${context} name`), target: expectString(record.target, `${context} target`) };
}

function parseChannelConversation(value: unknown, context: string): ChannelConversation {
  const record = expectRecord(value, context);
  const chatType = expectString(record.chat_type, `${context} chat_type`);
  if (chatType !== "group" && chatType !== "p2p") throw new UnsupportedChannelsError(`unsupported chat type ${chatType}`);
  const agentMode = parseChannelOverrideMode(record.agent_instructions_mode, `${context} agent_instructions_mode`);
  const approvalMode = parseChannelOverrideMode(record.approval_instructions_mode, `${context} approval_instructions_mode`);
  const reviewAllTools = record.review_all_tools == null ? undefined : expectBoolean(record.review_all_tools, `${context} review_all_tools`);
  return {
    id: expectString(record.id, `${context} id`), connection_id: expectString(record.connection_id, `${context} connection_id`),
    chat_id: expectString(record.chat_id, `${context} chat_id`), root_id: expectOptionalString(record.root_id, `${context} root_id`),
    thread_id: expectOptionalString(record.thread_id, `${context} thread_id`), chat_type: chatType,
    chat_mode: parseChannelChatMode(record.chat_mode, `${context} chat_mode`),
    chat_name: expectOptionalString(record.chat_name, `${context} chat_name`), display_name: expectString(record.display_name, `${context} display_name`),
    session_strategy: parseChannelSessionStrategy(record.session_strategy, `${context} session_strategy`),
    session_id: expectOptionalString(record.session_id, `${context} session_id`), workspace_id: expectOptionalString(record.workspace_id, `${context} workspace_id`),
		enabled: expectBoolean(record.enabled, `${context} enabled`), allowed_sender_ids: parseChannelStringList(record.allowed_sender_ids, `${context} allowed_sender_ids`),
		sender_policy: parseChannelSenderPolicy(record.sender_policy, `${context} sender_policy`),
    observed_senders: (record.observed_senders == null ? [] : expectArray(record.observed_senders, `${context} observed_senders`)).map((sender, index) => parseChannelSender(sender, `${context} observed_senders[${index}]`)),
    agent: parseChannelAgent(record.agent, `${context} agent`), profile_name: expectOptionalString(record.profile_name, `${context} profile_name`) ?? "",
    model: expectOptionalString(record.model, `${context} model`) ?? "", reasoning_effort: expectOptionalString(record.reasoning_effort, `${context} reasoning_effort`) ?? "",
    agent_instructions_mode: agentMode, agent_instructions: expectString(record.agent_instructions, `${context} agent_instructions`),
    approval_instructions_mode: approvalMode, approval_instructions: expectString(record.approval_instructions, `${context} approval_instructions`),
    approval_policy: parseChannelApprovalPolicy(record.approval_policy),
    review_all_tools: reviewAllTools, progress_detail: parseChannelProgressDetailOverride(record.progress_detail), progress_detail_unrecognized: unrecognizedProgressDetail(record.progress_detail), last_activity_at: expectString(record.last_activity_at, `${context} last_activity_at`),
    created_at: expectString(record.created_at, `${context} created_at`), updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseChannelMessage(value: unknown, context: string): ChannelMessage {
  const record = expectRecord(value, context);
  return {
    id: expectString(record.id, `${context} id`), connection_id: expectString(record.connection_id, `${context} connection_id`),
    conversation_id: expectString(record.conversation_id, `${context} conversation_id`), provider_message_id: expectString(record.provider_message_id, `${context} provider_message_id`),
    sender: parseChannelSender(record.sender, `${context} sender`), text: expectString(record.text, `${context} text`),
    mentioned_bot: expectBoolean(record.mentioned_bot, `${context} mentioned_bot`), trigger_status: expectString(record.trigger_status, `${context} trigger_status`),
    status_detail: expectOptionalString(record.status_detail, `${context} status_detail`), reply_message_id: expectOptionalString(record.reply_message_id, `${context} reply_message_id`),
    delivery_mode: record.delivery_mode == null || record.delivery_mode === "" ? undefined : parseChannelProgressMode(record.delivery_mode, `${context} delivery_mode`),
    reply_mode: record.reply_mode === "direct" ? "direct" : record.reply_mode === "thread" ? "thread" : undefined,
    cot_id: expectOptionalString(record.cot_id, `${context} cot_id`), final_message_id: expectOptionalString(record.final_message_id, `${context} final_message_id`),
    projected_sequence: expectOptionalNumber(record.projected_sequence, `${context} projected_sequence`), created_at: expectString(record.created_at, `${context} created_at`),
  };
}

function parseChannelChatMode(value: unknown, context: string): ChannelGroup["chat_mode"] {
  if (value == null || value === "") return undefined;
  if (value === "group" || value === "topic") return value;
  throw new UnsupportedChannelsError(`${context} must be group or topic`);
}

function parseChannelSender(value: unknown, context: string): { id: string; display_name?: string } {
  const record = expectRecord(value, context);
  return { id: expectString(record.id, `${context} id`), display_name: expectOptionalString(record.display_name, `${context} display_name`) };
}

function parseChannelStringList(value: unknown, context: string): string[] {
  return value == null ? [] : expectStringList(value, context);
}

function parseChannelOverrideMode(value: unknown, context: string): "inherit" | "replace" {
  const mode = expectString(value, context);
  if (mode !== "inherit" && mode !== "replace") throw new UnsupportedChannelsError(`${context} is ${mode}`);
  return mode;
}

function parseChannelProgressMode(value: unknown, context: string): "auto" | "cot" | "interactive_card" {
  const mode = expectString(value, context);
  if (mode !== "auto" && mode !== "cot" && mode !== "interactive_card") throw new UnsupportedChannelsError(`${context} is ${mode}`);
  return mode;
}

function parseChannelSessionStrategy(value: unknown, context: string): "topic" | "shared" {
  if (value == null || value === "") return "topic";
  const strategy = expectString(value, context);
  if (strategy !== "topic" && strategy !== "shared") throw new UnsupportedChannelsError(`${context} is ${strategy}`);
  return strategy;
}

function parseChannelSenderPolicy(value: unknown, context: string): "owners" | "all" | "selected" {
  if (value == null || value === "") return "selected";
  const policy = expectString(value, context);
  if (policy !== "owners" && policy !== "all" && policy !== "selected") throw new UnsupportedChannelsError(`${context} is ${policy}`);
  return policy;
}

function parseChannelAgent(value: unknown, context: string): AgentKind {
  if (value == null || value === "") return "zotigo";
  const agent = expectString(value, context);
  if (agent !== "zotigo" && agent !== "codex") throw new UnsupportedChannelsError(`${context} is ${agent}`);
  return agent;
}
