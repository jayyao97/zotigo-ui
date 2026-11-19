import type { SessionReadState, AgentKind, ApprovalPolicy, ChangeApprovalPolicyResponse, ChangeProfileResponse, SessionCommandResponse, SessionListResponse, SessionState, TitleSuggestionResponse, ZotigoSession } from "../../shared/zotigod";
import { expectRecord, expectNumber, expectString, expectOptionalNumber, expectOptionalString, expectOptionalBoolean, parseOptionalArray } from "./validation";

const sessionStates = new Set<SessionState>(["created", "starting", "running", "paused", "offline", "ended", "failed"]);
const approvalPolicies = new Set<ApprovalPolicy>(["manual", "auto", "bypass_permissions"]);

export function parseSessionListResponse(value: unknown): SessionListResponse {
  const record = expectRecord(value, "session list response");
  if (!Array.isArray(record.sessions)) {
    throw new Error("session list response sessions must be an array");
  }

  return {
    sessions: record.sessions.map((session, index) => parseSession(session, `session list response sessions[${index}]`)),
  };
}

export function parseSessionReadState(value: unknown, context: string): SessionReadState {
  const record = expectRecord(value, context);
  const version = expectNumber(record.version, `${context} version`);
  const readVersion = expectNumber(record.read_version, `${context} read_version`);
  const sequence = expectNumber(record.completed_sequence, `${context} completed_sequence`);
  if (![version, readVersion, sequence].every(value => Number.isSafeInteger(value) && value >= 0) || readVersion > version) throw new Error(`${context} invalid read cursor`);
  return { version, read_version: readVersion, completed_sequence: sequence, unread: readVersion < version };
}

export function parseSession(value: unknown, context: string): ZotigoSession {
  const record = expectRecord(value, context);
  const state = expectString(record.state, `${context} state`);
  const fork = record.forked_from === undefined ? undefined : expectRecord(record.forked_from, `${context} forked_from`);
  if (!isSessionState(state)) {
    throw new Error(`${context} state is not supported: ${state}`);
  }
  const approvalPolicy = expectString(record.approval_policy, `${context} approval_policy`);
  if (!isApprovalPolicy(approvalPolicy)) {
    throw new Error(`${context} approval_policy is not supported: ${approvalPolicy}`);
  }

  return {
    id: expectString(record.id, `${context} id`),
    latest_item_sequence: expectOptionalNumber(record.latest_item_sequence, `${context} latest_item_sequence`),
    read_state: record.read_state == null ? undefined : parseSessionReadState(record.read_state, `${context} read_state`),
    state,
    forked_from: fork ? {
      session_id: expectString(fork.session_id, `${context} forked_from session_id`),
      through_turn_id: expectString(fork.through_turn_id, `${context} forked_from through_turn_id`),
    } : undefined,
    live: expectOptionalBoolean(record.live, `${context} live`) ?? state !== "offline",
    working_directory: expectOptionalString(record.working_directory, `${context} working_directory`),
    profile: expectOptionalString(record.profile, `${context} profile`),
    agent: parseOptionalAgentKind(record.agent, `${context} agent`),
    model: expectOptionalString(record.model, `${context} model`),
    reasoning_effort: expectOptionalString(record.reasoning_effort, `${context} reasoning_effort`),
    approval_policy: approvalPolicy,
    last_prompt: expectOptionalString(record.last_prompt, `${context} last_prompt`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectOptionalString(record.updated_at, `${context} updated_at`),
    started_at: expectOptionalString(record.started_at, `${context} started_at`),
    ended_at: expectOptionalString(record.ended_at, `${context} ended_at`),
    error: expectOptionalString(record.error, `${context} error`),
    error_code: expectOptionalString(record.error_code, `${context} error_code`),
    working: expectOptionalBoolean(record.working, `${context} working`) ?? false,
    active_tool: expectOptionalString(record.active_tool, `${context} active_tool`),
    channel_tools_version: expectOptionalNumber(record.channel_tools_version, `${context} channel_tools_version`),
    channel_tools_eligible: expectOptionalBoolean(record.channel_tools_eligible, `${context} channel_tools_eligible`),
    context_usage: parseOptionalContextUsage(record.context_usage, `${context} context_usage`),
  };
}

export function parseAgentKind(value: unknown, context: string): AgentKind {
  const agent = expectString(value, context);
  if (agent !== "zotigo" && agent !== "codex") {
    throw new Error(`${context} is not supported: ${agent}`);
  }
  return agent;
}

function parseOptionalAgentKind(value: unknown, context: string): AgentKind | undefined {
  return value === undefined || value === null ? undefined : parseAgentKind(value, context);
}

export function parseChangeProfileResponse(value: unknown): ChangeProfileResponse {
  const record = expectRecord(value, "change profile response");
  const status = expectString(record.status, "change profile response status");
  if (status !== "applied" && status !== "pending") {
    throw new Error(`change profile response status is not supported: ${status}`);
  }
  return {
    profile: expectString(record.profile, "change profile response profile"),
    status,
    command_id: expectOptionalString(record.command_id, "change profile response command_id"),
  };
}

export function parseChangeApprovalPolicyResponse(value: unknown): ChangeApprovalPolicyResponse {
  const record = expectRecord(value, "change approval policy response");
  const status = expectString(record.status, "change approval policy response status");
  if (status !== "applied" && status !== "pending") {
    throw new Error(`change approval policy response status is not supported: ${status}`);
  }
  const approvalPolicy = expectString(
    record.approval_policy,
    "change approval policy response approval_policy",
  );
  if (!isApprovalPolicy(approvalPolicy)) {
    throw new Error(`change approval policy response approval_policy is not supported: ${approvalPolicy}`);
  }
  return {
    approval_policy: approvalPolicy,
    status,
    command_id: expectOptionalString(record.command_id, "change approval policy response command_id"),
  };
}

export function parseTitleSuggestionResponse(value: unknown): TitleSuggestionResponse {
  const record = expectRecord(value, "title suggestion response");
  return {
    title: expectString(record.title, "title suggestion response title"),
  };
}

export function parseSessionCommandResponse(value: unknown, context: string): SessionCommandResponse {
  const record = expectRecord(value, context);
  return {
    id: expectString(record.id, `${context} id`),
    sequence: expectNumber(record.sequence, `${context} sequence`),
    type: expectString(record.type, `${context} type`),
    text: expectOptionalString(record.text, `${context} text`),
    skills: parseOptionalArray(record.skills, `${context} skills`, expectString),
    images: parseOptionalArray(record.images, `${context} images`, parseCommandImageMetadata),
    turn_id: expectOptionalString(record.turn_id, `${context} turn_id`),
    reason: expectOptionalString(record.reason, `${context} reason`),
    created_at: expectString(record.created_at, `${context} created_at`),
  };
}

export function parseOptionalContextUsage(value: unknown, context: string) {
  if (value === undefined || value === null) return undefined;
  const record = expectRecord(value, context);
  const status = expectOptionalString(record.status, `${context} status`);
  if (status === "unavailable") return undefined;
  if (status !== undefined && status !== "available") {
    throw new Error(`${context} status is not supported: ${status}`);
  }
  return {
    tokens: expectNumber(record.tokens, `${context} tokens`),
    window: expectNumber(record.window, `${context} window`),
    source: expectOptionalString(record.source, `${context} source`),
  };
}

export function parseCommandImageMetadata(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    url: expectOptionalString(record.url, `${context} url`),
    media_type: expectOptionalString(record.media_type, `${context} media_type`),
    mime_type: expectOptionalString(record.mime_type, `${context} mime_type`),
    size_bytes: expectOptionalNumber(record.size_bytes, `${context} size_bytes`),
    width: expectOptionalNumber(record.width, `${context} width`),
    height: expectOptionalNumber(record.height, `${context} height`),
  };
}

function isSessionState(value: string): value is SessionState {
  return sessionStates.has(value as SessionState);
}

function isApprovalPolicy(value: string): value is ApprovalPolicy {
  return approvalPolicies.has(value as ApprovalPolicy);
}

export function parseOptionalApprovalPolicy(value: unknown, context: string): ApprovalPolicy | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const policy = expectString(value, context);
  if (!isApprovalPolicy(policy)) {
    throw new Error(`${context} is not supported: ${policy}`);
  }
  return policy;
}
