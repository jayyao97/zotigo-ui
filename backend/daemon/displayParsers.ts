import type { ApprovalDecisionResponse, InteractionResponse, DisplayContentPart, DisplayCommand, DisplayItem, DisplayItemType, DisplayApproval, DisplayInteraction, DisplayInteractionQuestion, DisplaySubagent, DisplayToolResult, DisplayToolResultContentPart, DisplayTurn, SessionItemsResponse } from "../../shared/zotigod";
import { expectRecord, expectArray, expectNumber, expectBoolean, expectString, expectOptionalNumber, expectOptionalString, expectOptionalBoolean, parseOptionalArray } from "./validation";
import { parseOptionalContextUsage, parseCommandImageMetadata, parseOptionalApprovalPolicy } from "./sessionParsers";

const displayItemTypes = new Set<DisplayItemType>([
  "request_retry", "model_usage_updated",
  "user_message",
  "steering_message",
  "session_command",
  "assistant_message",
  "error",
  "turn_started",
  "turn_paused",
  "turn_completed",
  "turn_failed",
  "turn_interrupted",
  "approval_request",
  "approval_decision",
  "interaction_request",
  "interaction_response",
  "context_compacted",
  "profile_changed",
  "profile_change_failed",
  "approval_policy_changed",
]);

export function parseSessionItemsResponse(value: unknown, context: string): SessionItemsResponse {
  const record = expectRecord(value, context);
  if (!Array.isArray(record.items)) {
    throw new Error(`${context} items must be an array`);
  }

  return {
    items: record.items.map((item, index) => parseDisplayItem(item, `${context} items[${index}]`)),
    next_cursor: expectString(record.next_cursor, `${context} next_cursor`),
    prev_cursor: expectString(record.prev_cursor, `${context} prev_cursor`),
    has_more: expectBoolean(record.has_more, `${context} has_more`),
  };
}

export function parseDisplayItem(value: unknown, context: string): DisplayItem {
  const record = expectRecord(value, context);
  const type = expectString(record.type, `${context} type`);
  if (!isDisplayItemType(type)) {
    throw new Error(`${context} type is not supported: ${type}`);
  }

  return {
    context_usage: parseOptionalContextUsage(record.context_usage, `${context} context_usage`),
    retry: record.retry == null ? undefined : parseRequestRetry(record.retry, context),
    ...(record.followup_question_id === undefined ? {} : { followup_question_id: expectOptionalString(record.followup_question_id, `${context} followup_question_id`) }),
    ...(record.before_input_id === undefined ? {} : { before_input_id: expectOptionalString(record.before_input_id, `${context} before_input_id`) }),
    id: expectString(record.id, `${context} id`),
    sequence: expectNumber(record.sequence, `${context} sequence`),
    type,
    role: expectOptionalString(record.role, `${context} role`),
    content: parseOptionalArray(record.content, `${context} content`, parseDisplayContentPart),
    subagent:
      record.subagent === undefined || record.subagent === null
        ? undefined
        : parseDisplaySubagent(record.subagent, `${context} subagent`),
    turn: record.turn === undefined || record.turn === null ? undefined : parseDisplayTurn(record.turn, `${context} turn`),
    approval:
      record.approval === undefined || record.approval === null
        ? undefined
        : parseDisplayApproval(record.approval, `${context} approval`),
    interaction:
      record.interaction === undefined || record.interaction === null
        ? undefined
        : parseDisplayInteraction(record.interaction, `${context} interaction`),
    command:
      record.command === undefined || record.command === null
        ? undefined
        : parseDisplayCommand(record.command, `${context} command`),
    profile:
      record.profile === undefined || record.profile === null
        ? undefined
        : parseDisplayProfileChange(record.profile, `${context} profile`),
    approval_policy:
      record.approval_policy === undefined || record.approval_policy === null
        ? undefined
        : parseDisplayApprovalPolicyChange(record.approval_policy, `${context} approval_policy`),
    context_compaction:
      record.context_compaction === undefined || record.context_compaction === null
        ? undefined
        : parseDisplayContextCompaction(record.context_compaction, `${context} context_compaction`),
    error: expectOptionalString(record.error, `${context} error`),
    created_at: expectString(record.created_at, `${context} created_at`),
  };
}

function parseRequestRetry(value: unknown, context: string): NonNullable<DisplayItem["retry"]> {
  const record = expectRecord(value, `${context} retry`);
  const status = expectOptionalString(record.status, `${context} retry status`);
  if (status !== undefined && status !== "waiting" && status !== "retrying" && status !== "recovered" && status !== "failed" && status !== "canceled" && status !== "context_recovery") throw new Error(`${context} invalid retry status`);
  return { ...(record.request_id === undefined ? {} : { request_id: expectString(record.request_id, `${context} retry request ID`) }), ...(status === undefined ? {} : { status }), attempt: expectNumber(record.attempt, `${context} retry attempt`), delay_ms: expectNumber(record.delay_ms, `${context} retry delay`) };
}

export function parseDisplaySubagent(value: unknown, context: string): DisplaySubagent {
  const record = expectRecord(value, context);
  const status = expectOptionalString(record.status, `${context} status`);
  if (status !== undefined && status !== "running" && status !== "waiting_approval" && status !== "completed" && status !== "failed") {
    throw new Error(`${context} status is not supported: ${status}`);
  }
  return {
    tool_call_id: expectString(record.tool_call_id, `${context} tool_call_id`),
    name: expectOptionalString(record.name, `${context} name`),
    agent_type: expectOptionalString(record.agent_type, `${context} agent_type`),
    workdir: expectOptionalString(record.workdir, `${context} workdir`),
    description: expectOptionalString(record.description, `${context} description`),
    status,
  };
}

function parseDisplayContextCompaction(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    original_tokens: expectNumber(record.original_tokens, `${context} original_tokens`),
    compressed_tokens: expectNumber(record.compressed_tokens, `${context} compressed_tokens`),
    messages_before: expectNumber(record.messages_before, `${context} messages_before`),
    messages_after: expectNumber(record.messages_after, `${context} messages_after`),
  };
}

function parseDisplayProfileChange(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    command_id: expectOptionalString(record.command_id, `${context} command_id`),
    from: expectOptionalString(record.from, `${context} from`),
    to: expectOptionalString(record.to, `${context} to`),
  };
}

function parseDisplayApprovalPolicyChange(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    command_id: expectOptionalString(record.command_id, `${context} command_id`),
    from: parseOptionalApprovalPolicy(record.from, `${context} from`),
    to: parseOptionalApprovalPolicy(record.to, `${context} to`),
  };
}

function parseDisplayContentPart(value: unknown, context: string): DisplayContentPart {
  const record = expectRecord(value, context);
  const toolCallRecord =
    record.tool_call === undefined || record.tool_call === null
      ? null
      : expectRecord(record.tool_call, `${context} tool_call`);
  return {
    type: expectString(record.type, `${context} type`),
    text: expectOptionalString(record.text, `${context} text`),
    image:
      record.image === undefined || record.image === null
        ? undefined
        : parseCommandImageMetadata(record.image, `${context} image`),
    tool_call: toolCallRecord
      ? {
          id: expectOptionalString(toolCallRecord.id, `${context} tool_call id`),
          name: expectOptionalString(toolCallRecord.name, `${context} tool_call name`),
          arguments: expectOptionalString(toolCallRecord.arguments, `${context} tool_call arguments`),
        }
      : undefined,
    tool_result:
      record.tool_result === undefined || record.tool_result === null
        ? undefined
        : parseDisplayToolResult(record.tool_result, `${context} tool_result`),
  };
}

function parseDisplayToolResult(value: unknown, context: string): DisplayToolResult {
  const record = expectRecord(value, context);
  return {
    tool_call_id: expectOptionalString(record.tool_call_id, `${context} tool_call_id`),
    tool_name: expectOptionalString(record.tool_name, `${context} tool_name`),
    result_type: expectOptionalString(record.result_type, `${context} result_type`),
    exit_code: expectOptionalNumber(record.exit_code ?? record.exitCode, `${context} exit_code`),
    text: expectOptionalString(record.text, `${context} text`),
    json: record.json,
    reason: expectOptionalString(record.reason, `${context} reason`),
    content: parseOptionalArray(record.content, `${context} content`, parseDisplayToolResultContentPart),
    is_error: expectOptionalBoolean(record.is_error, `${context} is_error`),
    metadata: record.metadata === undefined || record.metadata === null
      ? undefined
      : expectRecord(record.metadata, `${context} metadata`),
  };
}

function parseDisplayToolResultContentPart(value: unknown, context: string): DisplayToolResultContentPart {
  const record = expectRecord(value, context);
  const imageRecord =
    record.image === undefined || record.image === null ? null : expectRecord(record.image, `${context} image`);
  return {
    type: expectString(record.type, `${context} type`),
    text: expectOptionalString(record.text, `${context} text`),
    image: imageRecord
      ? {
          url: expectOptionalString(imageRecord.url, `${context} image url`),
          file_id: expectOptionalString(imageRecord.file_id, `${context} image file_id`),
          media_type: expectOptionalString(imageRecord.media_type, `${context} image media_type`),
          mime_type: expectOptionalString(imageRecord.mime_type, `${context} image mime_type`),
          size_bytes: expectOptionalNumber(imageRecord.size_bytes, `${context} image size_bytes`),
          width: expectOptionalNumber(imageRecord.width, `${context} image width`),
          height: expectOptionalNumber(imageRecord.height, `${context} image height`),
        }
      : undefined,
  };
}

function parseDisplayTurn(value: unknown, context: string): DisplayTurn {
  const record = expectRecord(value, context);
  return {
    id: expectOptionalString(record.id, `${context} id`),
    reason: expectOptionalString(record.reason, `${context} reason`),
    status: expectOptionalString(record.status, `${context} status`),
    provider_finish_reason: expectOptionalString(
      record.provider_finish_reason,
      `${context} provider_finish_reason`,
    ),
    last_agent_message: expectOptionalString(record.last_agent_message, `${context} last_agent_message`),
    duration_ms: expectOptionalNumber(record.duration_ms, `${context} duration_ms`),
  };
}

function parseDisplayApproval(value: unknown, context: string): DisplayApproval {
  const record = expectRecord(value, context);
  return {
    id: expectOptionalString(record.id, `${context} id`),
    turn_id: expectOptionalString(record.turn_id, `${context} turn_id`),
    pending: parseOptionalArray(record.pending, `${context} pending`, parsePendingApproval),
    decisions: parseOptionalArray(record.decisions, `${context} decisions`, parseApprovalDecision),
  };
}

function parsePendingApproval(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    tool_call_id: expectString(record.tool_call_id, `${context} tool_call_id`),
    tool_name: expectOptionalString(record.tool_name, `${context} tool_name`),
    arguments: expectOptionalString(record.arguments, `${context} arguments`),
    description: expectOptionalString(record.description, `${context} description`),
    reason: expectOptionalString(record.reason, `${context} reason`),
    risk_level: expectOptionalString(record.risk_level, `${context} risk_level`),
    source: expectOptionalString(record.source, `${context} source`),
    requires_snapshot: expectOptionalBoolean(record.requires_snapshot, `${context} requires_snapshot`),
  };
}

function parseApprovalDecision(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    tool_call_id: expectString(record.tool_call_id, `${context} tool_call_id`),
    approved: expectBoolean(record.approved, `${context} approved`),
    reason: expectOptionalString(record.reason, `${context} reason`),
    modified_args: expectOptionalString(record.modified_args, `${context} modified_args`),
  };
}

export function parseApprovalDecisionResponse(value: unknown): ApprovalDecisionResponse {
  const record = expectRecord(value, "approval decision response");
  const approval = parseDisplayApproval(record, "approval decision response");
  const status = expectString(record.status, "approval decision response status");
  if (status !== "pending" && status !== "resolved") {
    throw new Error(`approval decision response status is not supported: ${status}`);
  }
  return {
    ...approval,
    id: expectString(record.id, "approval decision response id"),
    session_id: expectString(record.session_id, "approval decision response session_id"),
    turn_id: expectString(record.turn_id, "approval decision response turn_id"),
    status,
    created_at: expectString(record.created_at, "approval decision response created_at"),
    resolved_at: expectOptionalString(record.resolved_at, "approval decision response resolved_at"),
  };
}

function parseDisplayInteraction(value: unknown, context: string): DisplayInteraction {
  const record = expectRecord(value, context);
  const kind = expectString(record.kind, `${context} kind`);
  const status = expectString(record.status, `${context} status`);
  if (kind !== "user_input") throw new Error(`${context} kind is not supported: ${kind}`);
  if (status !== "pending" && status !== "resolved" && status !== "expired") {
    throw new Error(`${context} status is not supported: ${status}`);
  }
  const answersRecord = record.answers === undefined || record.answers === null
    ? undefined
    : expectRecord(record.answers, `${context} answers`);
  const answers = answersRecord === undefined
    ? undefined
    : Object.fromEntries(Object.entries(answersRecord).map(([id, answer]) => [id, expectArray(answer, `${context} answers.${id}`).map((entry, index) => expectString(entry, `${context} answers.${id}[${index}]`))]));
  return {
    id: expectString(record.id, `${context} id`),
    kind,
    status,
    turn_id: expectString(record.turn_id, `${context} turn_id`),
    item_id: expectOptionalString(record.item_id, `${context} item_id`),
    requester: record.requester === undefined || record.requester === null ? undefined : parseInteractionRequester(record.requester, `${context} requester`),
    questions: parseOptionalArray(record.questions, `${context} questions`, parseInteractionQuestion),
    answers,
    reply_as_message: expectOptionalBoolean(record.reply_as_message, `${context} reply_as_message`),
    is_blocking: expectOptionalBoolean(record.is_blocking, `${context} is_blocking`),
    auto_resolve_ms: record.auto_resolve_ms === undefined ? undefined : expectNumber(record.auto_resolve_ms, `${context} auto_resolve_ms`),
  };
}

function parseInteractionRequester(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    agent: expectOptionalString(record.agent, `${context} agent`),
    thread_id: expectOptionalString(record.thread_id, `${context} thread_id`),
    name: expectOptionalString(record.name, `${context} name`),
  };
}

function parseInteractionQuestion(value: unknown, context: string): DisplayInteractionQuestion {
  const record = expectRecord(value, context);
  return {
    id: expectString(record.id, `${context} id`),
    header: expectOptionalString(record.header, `${context} header`),
    question: expectString(record.question, `${context} question`),
    is_other: expectOptionalBoolean(record.is_other, `${context} is_other`),
    is_secret: expectOptionalBoolean(record.is_secret, `${context} is_secret`),
    options: parseOptionalArray(record.options, `${context} options`, (value, optionContext) => {
      const option = expectRecord(value, optionContext);
      return { label: expectString(option.label, `${optionContext} label`), description: expectOptionalString(option.description, `${optionContext} description`) };
    }),
  };
}

export function parseInteractionResponse(value: unknown, context: string): InteractionResponse {
  const record = expectRecord(value, context);
  return { ...parseDisplayInteraction(record, context), session_id: expectString(record.session_id, `${context} session_id`) };
}

function parseDisplayCommand(value: unknown, context: string): DisplayCommand {
  const record = expectRecord(value, context);
  return {
    type: expectOptionalString(record.type, `${context} type`),
    text: expectOptionalString(record.text, `${context} text`),
    skills: parseOptionalArray(record.skills, `${context} skills`, expectString),
    images: parseOptionalArray(record.images, `${context} images`, parseCommandImageMetadata),
    turn_id: expectOptionalString(record.turn_id, `${context} turn_id`),
    reason: expectOptionalString(record.reason, `${context} reason`),
    profile: expectOptionalString(record.profile, `${context} profile`),
    approval_policy: parseOptionalApprovalPolicy(record.approval_policy, `${context} approval_policy`),
    request_context: record.request_context === undefined || record.request_context === null
      ? undefined
      : parseRequestContext(record.request_context, `${context} request_context`),
  };
}

function parseRequestContext(value: unknown, context: string): NonNullable<DisplayCommand["request_context"]> {
  const record = expectRecord(value, context);
  const actor = expectRecord(record.actor, `${context} actor`);
  return {
    source: expectString(record.source, `${context} source`),
    connection_id: expectOptionalString(record.connection_id, `${context} connection_id`),
    connection_name: expectOptionalString(record.connection_name, `${context} connection_name`),
    conversation_id: expectOptionalString(record.conversation_id, `${context} conversation_id`),
    conversation_name: expectOptionalString(record.conversation_name, `${context} conversation_name`),
    conversation_type: expectOptionalString(record.conversation_type, `${context} conversation_type`),
    external_conversation_id: expectOptionalString(record.external_conversation_id, `${context} external_conversation_id`),
    external_root_message_id: expectOptionalString(record.external_root_message_id, `${context} external_root_message_id`),
    external_thread_id: expectOptionalString(record.external_thread_id, `${context} external_thread_id`),
    external_message_id: expectOptionalString(record.external_message_id, `${context} external_message_id`),
    actor: {
      id: expectString(actor.id, `${context} actor id`),
      display_name: expectOptionalString(actor.display_name, `${context} actor display_name`),
      role: expectString(actor.role, `${context} actor role`),
    },
  };
}

function isDisplayItemType(value: string): value is DisplayItemType {
  return displayItemTypes.has(value as DisplayItemType);
}
