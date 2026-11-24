// Validation of untrusted operation arguments. Every IPC / RPC argument reaches
// the application service as `unknown`; these turn it into typed input or throw.
import { attachmentSizeError, parseMessageFiles, type MessageFileInput } from "../shared/messageFiles";
import { decodedBase64Size, maxMessageImageCount, messageImageSizeError } from "../shared/messageImages";
import type {
  AgentKind,
  ApprovalPolicy,
  ApprovalDecisionInput,
  MessageImageInput,
} from "../shared/zotigod";

import type { ChannelConnectionInput, ChannelConversationInput, ChannelOverrideMode, ChannelProgressMode, ChannelSessionStrategy } from "../shared/channels";

export function assertString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

export function assertNonEmptyString(value: unknown, name: string): string {
  const text = assertString(value, name).trim();
  if (!text) {
    throw new Error(`${name} is required`);
  }
  return text;
}

export function assertNullableString(value: unknown, name: string): string | null {
  if (value === null) {
    return null;
  }
  return assertString(value, name);
}

export function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

export function assertOpenMarkdownLinkInput(value: unknown): {
  href: string;
  basePath: string | null;
  baseKind: "directory" | "file";
  sessionId?: string;
} {
  const input = assertRecord(value, "Markdown link");
  const baseKind = assertString(input.baseKind, "baseKind");
  if (baseKind !== "directory" && baseKind !== "file") {
    throw new Error("baseKind must be directory or file");
  }
  return {
    href: assertNonEmptyString(input.href, "href"),
    basePath: assertNullableString(input.basePath, "basePath"),
    baseKind,
    sessionId: input.sessionId === undefined ? undefined : assertNonEmptyString(input.sessionId, "sessionId"),
  };
}

export function assertSaveTextFileInput(value: unknown): {
  path: string;
  content: string;
  expectedMtimeMs: number;
  expectedContentRevision?: string;
  sessionId?: string;
} {
  const input = assertRecord(value, "text file save");
  return {
    path: assertNonEmptyString(input.path, "path"),
    content: assertString(input.content, "content"),
    expectedMtimeMs: assertNumber(input.expectedMtimeMs, "expectedMtimeMs"),
    expectedContentRevision: input.expectedContentRevision === undefined ? undefined : assertNonEmptyString(input.expectedContentRevision, "expectedContentRevision"),
    sessionId: input.sessionId === undefined ? undefined : assertNonEmptyString(input.sessionId, "sessionId"),
  };
}

export function assertOptionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function assertCreateWorkspaceInput(value: unknown): {
  projectId: string;
  title: string;
  branchName?: string;
  repositories: Array<{ repositoryId: string; baseRef: string }>;
  folders: Array<{ folderId: string; mode?: "direct" | "reference" | "copy" }>;
} {
  const record = assertRecord(value, "create workspace input");
  return {
    projectId: assertNonEmptyString(record.projectId, "projectId"),
    title: assertNonEmptyString(record.title, "workspace title"),
    branchName: optionalTrimmedString(record.branchName, "branchName"),
    repositories: assertArray(record.repositories, "repositories").map((item, index) => {
      const repository = assertRecord(item, `repositories[${index}]`);
      return {
        repositoryId: assertNonEmptyString(repository.repositoryId, `repositories[${index}].repositoryId`),
        baseRef: optionalTrimmedString(repository.baseRef, `repositories[${index}].baseRef`) ?? "",
      };
    }),
    folders: assertArray(record.folders, "folders").map((item, index) => {
      const folder = assertRecord(item, `folders[${index}]`);
      const mode = folder.mode === undefined ? undefined : assertString(folder.mode, `folders[${index}].mode`);
      if (mode !== undefined && mode !== "direct" && mode !== "reference" && mode !== "copy") throw new Error("folder mode is invalid");
      return { folderId: assertNonEmptyString(folder.folderId, `folders[${index}].folderId`), mode };
    }),
  };
}

export function assertAddWorkspaceSourceInput(value: unknown): {
  sourceId: string;
  mode?: "direct" | "reference" | "copy";
  baseRef?: string;
  branchName?: string;
} {
  const record = assertRecord(value, "add workspace source input");
  const mode = record.mode === undefined ? undefined : assertString(record.mode, "mode");
  if (mode !== undefined && mode !== "direct" && mode !== "reference" && mode !== "copy") {
    throw new Error("workspace source mode is invalid");
  }
  return {
    sourceId: assertNonEmptyString(record.sourceId, "sourceId"),
    mode,
    baseRef: optionalTrimmedString(record.baseRef, "baseRef"),
    branchName: optionalTrimmedString(record.branchName, "branchName"),
  };
}

export function optionalTrimmedString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return assertString(value, name).trim() || undefined;
}

export function assertCreateConversationInput(value: unknown): {
  projectId: string | null;
  workspaceId: string | null;
  title?: string;
  profile?: string;
  approvalPolicy?: ApprovalPolicy;
  agent?: AgentKind;
  model?: string;
  reasoningEffort?: string;
} {
  const record = assertRecord(value, "create conversation input");
  return {
    projectId: assertNullableString(record.projectId, "projectId"),
    workspaceId:
      record.workspaceId === undefined ? null : assertNullableString(record.workspaceId, "workspaceId"),
    title: record.title === undefined ? undefined : assertString(record.title, "title"),
    profile: record.profile === undefined ? undefined : assertNonEmptyString(record.profile, "profile"),
    approvalPolicy:
      record.approvalPolicy === undefined
        ? undefined
        : assertApprovalPolicy(record.approvalPolicy, "approvalPolicy"),
    agent: record.agent === undefined ? undefined : assertAgentKind(record.agent, "agent"),
    model: record.model === undefined ? undefined : assertNonEmptyString(record.model, "model"),
    reasoningEffort:
      record.reasoningEffort === undefined
        ? undefined
        : assertNonEmptyString(record.reasoningEffort, "reasoningEffort"),
  };
}

function assertAgentKind(value: unknown, name: string): AgentKind {
  const agent = assertString(value, name);
  if (agent !== "zotigo" && agent !== "codex") {
    throw new Error(`${name} must be zotigo or codex`);
  }
  return agent;
}

export function assertApprovalPolicy(value: unknown, name: string): ApprovalPolicy {
  const policy = assertString(value, name);
  if (policy !== "manual" && policy !== "auto" && policy !== "bypass_permissions") {
    throw new Error(`${name} must be manual, auto or bypass_permissions`);
  }
  return policy;
}

export function assertSendConversationMessageInput(value: unknown): {
  mode: "steering" | "queue";
  conversationId: string;
  clientMessageId?: string;
  text: string;
  images: MessageImageInput[];
  files: MessageFileInput[];
  skills: string[];
  approvalPolicy?: ApprovalPolicy;
} {
  const record = assertRecord(value, "send conversation message input");
  if (record.mode !== undefined && record.mode !== "steering" && record.mode !== "queue") throw new Error("Invalid send mode");
  const { images, files } = assertAttachments(record);
  const text = assertString(record.text, "text").trim();
  if (!text && images.length === 0 && files.length === 0) {
    throw new Error("message requires text or images");
  }
  return {
    conversationId: assertString(record.conversationId, "conversationId"),
    mode: record.mode === "queue" ? "queue" : "steering",
    clientMessageId: record.clientMessageId === undefined ? undefined : assertString(record.clientMessageId, "clientMessageId"),
    text,
    images,
    files,
    skills: assertSkillNames(record.skills),
    approvalPolicy:
      record.approvalPolicy === undefined
        ? undefined
        : assertApprovalPolicy(record.approvalPolicy, "approvalPolicy"),
  };
}

function assertAttachments(record: Record<string, unknown>) {
  const images = assertMessageImages(record.images);
  const files = parseMessageFiles(record.files);
  const error = attachmentSizeError([
    ...images.map((image) => ({ size: decodedBase64Size(image.data_base64), image: true })),
    ...files.map((file) => ({ size: decodedBase64Size(file.data_base64), image: false })),
  ]);
  if (error) throw new Error(error);
  return { images, files };
}

function assertMessageImages(value: unknown): MessageImageInput[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("images must be an array");
  }
  if (value.length > maxMessageImageCount) {
    throw new Error(`A message can include at most ${maxMessageImageCount} images.`);
  }
  const images = value.map((image, index) => {
    const record = assertRecord(image, `images[${index}]`);
    const mimeType = assertString(record.mime_type, `images[${index}].mime_type`);
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
      throw new Error("images must be PNG, JPEG, or WebP");
    }
    return {
      mime_type: mimeType,
      data_base64: assertNonEmptyString(record.data_base64, `images[${index}].data_base64`),
    };
  });
  const sizeError = messageImageSizeError(images.map((image) => decodedBase64Size(image.data_base64)));
  if (sizeError) throw new Error(sizeError);
  return images;
}

function assertSkillNames(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return assertStringArray(value, "skills").map((name, index) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error(`skills[${index}] must not be empty`);
    return trimmed;
  });
}

export function assertApprovalDecisions(value: unknown): ApprovalDecisionInput[] {
  const decisions = assertArray(value, "decisions");
  if (decisions.length === 0) throw new Error("decisions must not be empty");
  return decisions.map((item, index) => {
    const record = assertRecord(item, `decisions[${index}]`);
    return {
      tool_call_id: assertNonEmptyString(record.tool_call_id, `decisions[${index}].tool_call_id`),
      approved: assertBoolean(record.approved, `decisions[${index}].approved`),
      reason: optionalTrimmedString(record.reason, `decisions[${index}].reason`),
    };
  });
}

export function assertInteractionAnswers(value: unknown): Record<string, string[]> {
  const record = assertRecord(value, "answers");
  const answers: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [questionId, answer] of Object.entries(record)) {
    if (!questionId.trim()) throw new Error("answer question id must not be empty");
    answers[questionId] = assertArray(answer, `answers.${questionId}`).map((value, index) => {
      const item = assertString(value, `answers.${questionId}[${index}]`);
      if (!item.trim()) throw new Error(`answers.${questionId}[${index}] must not be empty`);
      return item;
    });
  }
  if (Object.keys(answers).length === 0) throw new Error("answers must not be empty");
  return answers;
}

function assertChannelApprovalPolicy(value: unknown): "auto" | "bypass_permissions" | "" | undefined {
  if (value === undefined || value === "" || value === "auto" || value === "bypass_permissions") return value;
  throw new Error("approval_policy must be auto or bypass_permissions");
}

export function assertChannelConnectionInput(value: unknown): ChannelConnectionInput {
	const input = assertRecord(value, "channel connection");
	if (input.provider !== "feishu") throw new Error("provider must be feishu");
	return {
		provider: "feishu",
		name: assertNonEmptyString(input.name, "name"),
		app_id: assertNonEmptyString(input.app_id, "app_id"),
		app_secret: input.app_secret === undefined ? undefined : assertString(input.app_secret, "app_secret"),
		clear_secret: input.clear_secret === undefined ? undefined : assertBoolean(input.clear_secret, "clear_secret"),
		enabled: assertBoolean(input.enabled, "enabled"),
		allow_chat_ids: assertStringArray(input.allow_chat_ids, "allow_chat_ids"),
		owner_sender_ids: input.owner_sender_ids === undefined ? undefined : assertStringArray(input.owner_sender_ids, "owner_sender_ids"),
		agent_instructions: assertString(input.agent_instructions, "agent_instructions"),
		approval_instructions: assertString(input.approval_instructions, "approval_instructions"),
		approval_policy: assertChannelApprovalPolicy(input.approval_policy),
		review_all_tools: assertBoolean(input.review_all_tools, "review_all_tools"),
		progress_mode: assertChannelProgressMode(input.progress_mode, "progress_mode"),
	};
}

function assertChannelProgressMode(value: unknown, name: string): ChannelProgressMode {
	if (value !== "auto" && value !== "cot" && value !== "interactive_card") throw new Error(`${name} must be auto, cot, or interactive_card`);
	return value;
}

function assertChannelOverrideMode(value: unknown, name: string): ChannelOverrideMode {
	if (value !== "inherit" && value !== "replace") throw new Error(`${name} must be inherit or replace`);
	return value;
}

function assertChannelSessionStrategy(value: unknown, name: string): ChannelSessionStrategy {
	if (value !== "topic" && value !== "shared") throw new Error(`${name} must be topic or shared`);
	return value;
}

export function assertChannelConversationInput(value: unknown): ChannelConversationInput {
	const input = assertRecord(value, "channel conversation");
	return {
		display_name: assertString(input.display_name, "display_name"),
		session_strategy: assertChannelSessionStrategy(input.session_strategy, "session_strategy"),
		session_id: assertString(input.session_id, "session_id"),
		workspace_id: assertString(input.workspace_id, "workspace_id"),
		enabled: assertBoolean(input.enabled, "enabled"),
		sender_policy: assertChannelSenderPolicy(input.sender_policy, "sender_policy"),
		allowed_sender_ids: assertStringArray(input.allowed_sender_ids, "allowed_sender_ids"),
		agent: assertAgentKind(input.agent, "agent"),
		profile_name: assertString(input.profile_name, "profile_name"),
		model: assertString(input.model, "model"),
		reasoning_effort: assertString(input.reasoning_effort, "reasoning_effort"),
		agent_instructions_mode: assertChannelOverrideMode(input.agent_instructions_mode, "agent_instructions_mode"),
		agent_instructions: assertString(input.agent_instructions, "agent_instructions"),
		approval_instructions_mode: assertChannelOverrideMode(input.approval_instructions_mode, "approval_instructions_mode"),
		approval_instructions: assertString(input.approval_instructions, "approval_instructions"),
		approval_policy: assertChannelApprovalPolicy(input.approval_policy),
		review_all_tools: input.review_all_tools === undefined ? undefined : assertBoolean(input.review_all_tools, "review_all_tools"),
	};
}

function assertChannelSenderPolicy(value: unknown, name: string): "owners" | "all" | "selected" {
	if (value !== "owners" && value !== "all" && value !== "selected") throw new Error(`${name} must be owners, all, or selected`);
	return value;
}

export function assertSessionItemsQuery(value: unknown): { limit?: number; after?: number; before?: number } {
  if (value === undefined || value === null) {
    return {};
  }
  const record = assertRecord(value, "session items query");
  return {
    limit: record.limit === undefined ? undefined : assertPositiveInteger(record.limit, "limit"),
    after: record.after === undefined ? undefined : assertPositiveInteger(record.after, "after"),
    before: record.before === undefined ? undefined : assertPositiveInteger(record.before, "before"),
  };
}

function assertPositiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function assertArray(value: unknown, name: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

export function assertStringArray(value: unknown, name: string): string[] {
  return assertArray(value, name).map((item, index) => assertNonEmptyString(item, `${name}[${index}]`));
}

export function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
