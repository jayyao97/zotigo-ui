import { fetchDaemon } from "./daemonHttp";
import type { AgentCatalogEntry, AgentCatalogResponse, AgentKind, ApprovalPolicy, ApprovalDecisionInput, ApprovalDecisionResponse, CatalogProject, CatalogProjectDetail, CatalogSessionProjection, CatalogSource, CatalogSourceInspection, CatalogWorkspace, CatalogWorkspaceSource, CatalogWorkspaceSourceInput, ChangeApprovalPolicyResponse, CodexSettingsInput, DisplayContentPart, DisplayDelta, DisplayCommand, DisplayItem, DisplayItemType, DisplayApproval, DisplayToolResult, DisplayToolResultContentPart, DisplayTurn, HealthResponse, ProfilesResponse, ChangeProfileResponse, MessageImageInput, SessionCommandResponse, CreateSessionInput, SessionListResponse, SessionItemsQuery, SessionItemsResponse, SessionDisplayEvent, SessionState, SkillsResponse, TitleSuggestionResponse, WorkspaceArchivePreview, WorkspaceDeletePreview, WorkspaceStatus, ZotigoSession } from "../shared/zotigod";
import type { DaemonConfig } from "../shared/clientTypes";

const defaultBaseUrl = "http://127.0.0.1:8766";
const sessionStates = new Set<SessionState>(["created", "starting", "running", "paused", "offline", "ended", "failed"]);
const approvalPolicies = new Set<ApprovalPolicy>(["auto", "bypass_permissions"]);
const catalogWorkspaceStatuses = new Set<WorkspaceStatus>([
  "provisioning", "ready", "error", "archiving", "archived", "deleting", "deleted",
]);
const displayItemTypes = new Set<DisplayItemType>([
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
  "context_compacted",
  "profile_changed",
  "profile_change_failed",
  "approval_policy_changed",
]);

let daemonBaseUrl = normalizeDaemonBaseUrl(process.env.ZOTIGOD_URL ?? defaultBaseUrl);

export class ZotigodRequestError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
    readonly code?: string,
  ) {
    super(body || statusText || `zotigod request failed with ${status}`);
    this.name = "ZotigodRequestError";
  }
}

export function isMessageDuringActiveTurnError(error: unknown): boolean {
  return error instanceof ZotigodRequestError
    && error.status === 409
    && (error.code === "active_turn" || error.code === "conflict");
}

export class UnsupportedSessionEventsError extends Error {
  constructor() {
    super("zotigod does not support session event streams");
    this.name = "UnsupportedSessionEventsError";
  }
}

export function getDaemonConfig(): DaemonConfig {
  return { baseUrl: daemonBaseUrl };
}

export function setDaemonBaseUrl(baseUrl: string): DaemonConfig {
  daemonBaseUrl = normalizeDaemonBaseUrl(baseUrl);
  return getDaemonConfig();
}

export function health(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJSON("/health", { signal }).then(parseHealthResponse);
}

export function listSkills(sessionId?: string, forceReload = false): Promise<SkillsResponse> {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (forceReload) params.set("force_reload", "true");
  const search = params.toString();
  return requestJSON(`/skills${search ? `?${search}` : ""}`).then(parseSkillsResponse);
}

export function getProfiles(workingDirectory?: string): Promise<ProfilesResponse> {
  const params = new URLSearchParams();
  if (workingDirectory !== undefined) {
    params.set("working_directory", workingDirectory);
  }
  const search = params.toString();
  return requestJSON(`/config/profiles${search ? `?${search}` : ""}`).then(parseProfilesResponse);
}

export function getAgents(): Promise<AgentCatalogResponse> {
  return requestJSON("/agents").then(parseAgentCatalogResponse);
}

export function prepareCodex(): Promise<AgentCatalogEntry> {
  return requestJSON("/agents/codex/prepare", { method: "POST" })
    .then((value) => parseAgentCatalogEntry(value, "prepare Codex response"));
}

export async function listSessions(): Promise<ZotigoSession[]> {
  const response = parseSessionListResponse(await requestJSON("/sessions"));
  return response.sessions;
}

export function createSession(input: CreateSessionInput = {}): Promise<ZotigoSession> {
  const payload: Record<string, string> = {};
  if (input.workingDirectory !== undefined) {
    payload.working_directory = input.workingDirectory;
  }
  if (input.workspaceId !== undefined) {
    payload.workspace_id = input.workspaceId;
  }
  if (input.profile !== undefined) {
    payload.profile = input.profile;
  }
  if (input.approvalPolicy !== undefined) {
    payload.approval_policy = input.approvalPolicy;
  }
  if (input.agent !== undefined) {
    payload.agent = input.agent;
  }
  if (input.model !== undefined) {
    payload.model = input.model;
  }
  if (input.reasoningEffort !== undefined) {
    payload.reasoning_effort = input.reasoningEffort;
  }
  const body = Object.keys(payload).length === 0 ? undefined : JSON.stringify(payload);
  return requestJSON("/sessions", {
    method: "POST",
    body,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  }).then((value) => parseSession(value, "create session response"));
}

export async function listCatalogProjects(): Promise<CatalogProject[]> {
  const record = expectRecord(await requestJSON("/projects"), "project list response");
  return expectArray(record.projects, "project list response projects")
    .map((value, index) => parseCatalogProject(value, `project list response projects[${index}]`));
}

export function createCatalogProject(name: string): Promise<CatalogProject> {
  return requestJSON("/projects", jsonRequest("POST", { name }))
    .then((value) => parseCatalogProject(value, "create project response"));
}

export function renameCatalogProject(id: string, name: string): Promise<CatalogProject> {
  return requestJSON(`/projects/${encodeURIComponent(id)}`, jsonRequest("PUT", { name }))
    .then((value) => parseCatalogProject(value, "rename project response"));
}

export function getCatalogProject(id: string): Promise<CatalogProjectDetail> {
  return requestJSON(`/projects/${encodeURIComponent(id)}`)
    .then((value) => parseCatalogProjectDetail(value, "project detail response"));
}

export function inspectCatalogSource(sourcePath: string): Promise<CatalogSourceInspection> {
  return requestJSON("/sources/inspect", jsonRequest("POST", { path: sourcePath }))
    .then((value) => parseCatalogSourceInspection(value, "source inspection response"));
}

export function addCatalogSource(projectId: string, sourcePath: string, folderMode?: string): Promise<CatalogSource> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/sources`, jsonRequest("POST", {
    path: sourcePath,
    ...(folderMode ? { folder_mode: folderMode } : {}),
  })).then((value) => parseCatalogSource(value, "create source response"));
}

export function deleteCatalogSource(projectId: string, sourceId: string): Promise<void> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" })
    .then(() => undefined);
}

export async function listCatalogWorkspaces(projectId: string): Promise<CatalogWorkspace[]> {
  const record = expectRecord(
    await requestJSON(`/projects/${encodeURIComponent(projectId)}/workspaces`),
    "workspace list response",
  );
  return expectArray(record.workspaces, "workspace list response workspaces")
    .map((value, index) => parseCatalogWorkspace(value, `workspace list response workspaces[${index}]`));
}

export function createCatalogWorkspace(
  projectId: string,
  title: string,
  sources: CatalogWorkspaceSourceInput[],
): Promise<CatalogWorkspace> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/workspaces`, jsonRequest("POST", { title, sources }))
    .then((value) => parseCatalogWorkspace(value, "create workspace response"));
}

export async function listCatalogWorkspaceSources(id: string): Promise<CatalogWorkspaceSource[]> {
  const record = expectRecord(
    await requestJSON(`/workspaces/${encodeURIComponent(id)}/sources`),
    "workspace source list response",
  );
  return expectArray(record.sources, "workspace source list response sources")
    .map((value, index) => parseCatalogWorkspaceSource(value, `workspace source list response sources[${index}]`));
}

export function addCatalogWorkspaceSource(id: string, source: CatalogWorkspaceSourceInput): Promise<CatalogWorkspaceSource> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/sources`, jsonRequest("POST", { ...source }))
    .then((value) => parseCatalogWorkspaceSource(value, "add workspace source response"));
}

export function retryCatalogWorkspace(id: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/retry`, { method: "POST" })
    .then((value) => parseCatalogWorkspace(value, "retry workspace response"));
}

export function getCatalogWorkspace(id: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}`)
    .then((value) => parseCatalogWorkspace(value, "workspace detail response"));
}

export function renameCatalogWorkspace(id: string, title: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}`, jsonRequest("PUT", { title }))
    .then((value) => parseCatalogWorkspace(value, "rename workspace response"));
}

export function previewCatalogWorkspaceArchive(id: string): Promise<WorkspaceArchivePreview> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/archive-preview`)
    .then((value) => parseWorkspaceArchivePreview(value, "workspace archive preview response"));
}

export function archiveCatalogWorkspace(id: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/archive`, { method: "POST" })
    .then((value) => parseCatalogWorkspace(value, "archive workspace response"));
}

export function previewCatalogWorkspaceDelete(id: string): Promise<WorkspaceDeletePreview> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/delete-preview`)
    .then((value) => parseWorkspaceDeletePreview(value, "workspace delete preview response"));
}

export async function deleteCatalogWorkspace(id: string, confirmation: string): Promise<void> {
  await previewCatalogWorkspaceDelete(id);
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/delete`, jsonRequest("POST", { confirmation })).then(() => undefined);
}

export async function listCatalogSessions(
  options: { syncCodex?: boolean } = {},
): Promise<CatalogSessionProjection[]> {
  const path = options.syncCodex ? "/catalog/sessions?sync_codex=true" : "/catalog/sessions";
  const record = expectRecord(await requestJSON(path), "catalog session list response");
  return expectArray(record.sessions, "catalog session list response sessions")
    .map((value, index) => parseCatalogSessionProjection(value, `catalog session list response sessions[${index}]`));
}

export function setCatalogSessionTitle(id: string, title: string): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "title", "PUT", { title });
}

export function setCatalogSessionPinned(id: string, pinned: boolean): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "pinned", "PUT", { pinned });
}

export function setCatalogSessionPosition(id: string, position: number): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "position", "PUT", { position });
}

export function archiveCatalogSession(id: string): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "archive", "POST");
}

function sessionOrganizationRequest(
  id: string,
  action: string,
  method: "POST" | "PUT",
  payload?: Record<string, unknown>,
): Promise<CatalogSessionProjection> {
  const init = payload ? jsonRequest(method, payload) : { method };
  return requestJSON(`/sessions/${encodeURIComponent(id)}/${action}`, init)
    .then((value) => parseCatalogSessionProjection(value, `session ${action} response`));
}

function jsonRequest(method: "POST" | "PUT", payload: Record<string, unknown>): RequestInit {
  return { method, body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } };
}

export function changeSessionProfile(id: string, profile: string): Promise<ChangeProfileResponse> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/profile`, {
    method: "PUT",
    body: JSON.stringify({ profile }),
    headers: { "Content-Type": "application/json" },
  }).then(parseChangeProfileResponse);
}

export function changeSessionApprovalPolicy(
  id: string,
  approvalPolicy: ApprovalPolicy,
): Promise<ChangeApprovalPolicyResponse> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/approval-policy`, {
    method: "PUT",
    body: JSON.stringify({ approval_policy: approvalPolicy }),
    headers: { "Content-Type": "application/json" },
  }).then(parseChangeApprovalPolicyResponse);
}

export function submitSessionApproval(
  id: string,
  approvalId: string,
  decisions: ApprovalDecisionInput[],
): Promise<ApprovalDecisionResponse> {
  return requestJSON(
    `/sessions/${encodeURIComponent(id)}/approvals/${encodeURIComponent(approvalId)}`,
    {
      method: "POST",
      body: JSON.stringify({ decisions }),
      headers: { "Content-Type": "application/json" },
    },
  ).then(parseApprovalDecisionResponse);
}

export function changeSessionCodexSettings(id: string, input: CodexSettingsInput): Promise<ZotigoSession> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/codex-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.model, reasoning_effort: input.reasoningEffort }),
  }).then((value) => parseSession(value, "change Codex settings response"));
}

export function getSession(id: string): Promise<ZotigoSession> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}`).then((value) => parseSession(value, "get session response"));
}

export function startSession(id: string): Promise<ZotigoSession> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/start`, {
    method: "POST",
  }).then((value) => parseSession(value, "start session response"));
}

export function pauseSession(id: string, turnId: string): Promise<SessionCommandResponse> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turn_id: turnId }),
  }).then((value) => parseSessionCommandResponse(value, "pause session response"));
}

export function sendSessionMessage(
  id: string,
  text: string,
  images: MessageImageInput[] = [],
  skills: string[] = [],
): Promise<SessionCommandResponse> {
  return postSessionTextCommand(id, "messages", text, "send session message response", images, skills);
}

export function sendSessionSteering(
  id: string,
  text: string,
  images: MessageImageInput[] = [],
  skills: string[] = [],
): Promise<SessionCommandResponse> {
  return postSessionTextCommand(id, "steering", text, "send session steering response", images, skills);
}

export function listSessionItems(id: string, query: SessionItemsQuery = {}): Promise<SessionItemsResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.after !== undefined) {
    params.set("after", String(query.after));
  }
  if (query.before !== undefined) {
    params.set("before", String(query.before));
  }

  const search = params.toString();
  const path = `/sessions/${encodeURIComponent(id)}/items${search ? `?${search}` : ""}`;
  return requestJSON(path).then((value) => parseSessionItemsResponse(value, "session items response"));
}

export async function streamSessionEvents(
  id: string,
  after: number | undefined,
  onEvent: (event: SessionDisplayEvent) => void | Promise<void>,
  onConnected: () => void | Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams();
  if (after !== undefined && after > 0) {
    params.set("after", String(after));
  }
  const search = params.toString();
  const path = `/sessions/${encodeURIComponent(id)}/events${search ? `?${search}` : ""}`;
  const response = await fetchDaemon(`${daemonBaseUrl}${path}`, {
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (response.status === 404 || response.status === 405) {
    throw new UnsupportedSessionEventsError();
  }
  if (!response.ok) {
    throw new ZotigodRequestError(response.status, response.statusText, await response.text());
  }
  if (!response.body) {
    throw new Error("zotigod session event stream has no response body");
  }

  const reader = response.body.getReader();
  try {
    await onConnected();
    const decoder = new TextDecoder();
    let buffer = "";
    let frame: SseFrame = emptySseFrame();

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line === "") {
          const event = parseSessionEventFrame(frame);
          if (event) {
            await onEvent(event);
          }
          frame = emptySseFrame();
          continue;
        }
        if (line.startsWith(":")) {
          continue;
        }
        const separator = line.indexOf(":");
        const field = separator === -1 ? line : line.slice(0, separator);
        const valueText = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
        if (field === "event") frame.event = valueText;
        if (field === "id") frame.id = valueText;
        if (field === "data") frame.data.push(valueText);
      }
      if (done) {
        if (frame.event || frame.id || frame.data.length > 0) {
          const event = parseSessionEventFrame(frame);
          if (event) await onEvent(event);
        }
        return;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* The aborted transport may already be closed. */ }
    reader.releaseLock();
  }
}

interface SseFrame {
  event: string;
  id: string;
  data: string[];
}

function emptySseFrame(): SseFrame {
  return { event: "", id: "", data: [] };
}

export function parseSessionEventFrame(frame: SseFrame): SessionDisplayEvent | null {
  if (frame.data.length === 0) {
    return null;
  }
  const data = JSON.parse(frame.data.join("\n")) as unknown;
  if (frame.event === "item") {
    const item = parseDisplayItem(data, "session event item");
    const sequence = Number(frame.id);
    if (!Number.isSafeInteger(sequence) || sequence <= 0 || item.sequence !== sequence) {
      throw new Error("session event item id must match its durable sequence");
    }
    return { type: "item", item };
  }
  if (frame.event === "delta") {
    return { type: "delta", delta: parseDisplayDelta(data) };
  }
  return null;
}

function parseDisplayDelta(value: unknown): DisplayDelta {
  const record = expectRecord(value, "session event delta");
  const role = expectString(record.role, "session event delta role");
  const partType = expectString(record.part_type, "session event delta part_type");
  if (role !== "assistant") {
    throw new Error(`session event delta role is not supported: ${role}`);
  }
  if (partType !== "text" && partType !== "reasoning" && partType !== "tool_progress") {
    throw new Error(`session event delta part_type is not supported: ${partType}`);
  }
  const toolCallID = expectOptionalString(record.tool_call_id, "session event delta tool_call_id");
  const toolName = expectOptionalString(record.tool_name, "session event delta tool_name");
  if (partType === "tool_progress" && !toolCallID) {
    throw new Error("session event tool progress delta requires tool_call_id");
  }
  const delta: DisplayDelta = {
    item_id: expectString(record.item_id, "session event delta item_id"),
    role,
    part_type: partType,
    delta: expectString(record.delta, "session event delta delta"),
  };
  if (toolCallID !== undefined) delta.tool_call_id = toolCallID;
  if (toolName !== undefined) delta.tool_name = toolName;
  return delta;
}

export function suggestSessionTitle(id: string): Promise<TitleSuggestionResponse> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/title-suggestion`, {
    method: "POST",
  }).then(parseTitleSuggestionResponse);
}

function postSessionTextCommand(
  id: string,
  action: "messages" | "steering",
  text: string,
  context: string,
  images: MessageImageInput[] = [],
  skills: string[] = [],
): Promise<SessionCommandResponse> {
  const payload = {
    text,
    ...(images.length > 0 ? { images } : {}),
    ...(skills.length > 0 ? { skills } : {}),
  };
  return requestJSON(`/sessions/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  }).then((value) => parseSessionCommandResponse(value, context));
}

function normalizeDaemonBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("zotigod URL is required");
  }

  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("zotigod URL must use http or https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("zotigod URL must not include credentials, query, or fragment");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

async function requestJSON(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetchDaemon(`${daemonBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  }).catch((error: unknown) => {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.warn("daemon_request_failed method=%s path=%s error_type=%s", init.method ?? "GET", path.split("?")[0], error instanceof Error ? error.name : typeof error);
    }
    throw error;
  });

  if (!response.ok) console.warn("daemon_http_error method=%s path=%s status=%d", init.method ?? "GET", path.split("?")[0], response.status);

  const body = await response.text();
  const trimmedBody = body.trim();
  let parsedBody: unknown;
  if (trimmedBody !== "") {
    try {
      parsedBody = JSON.parse(trimmedBody) as unknown;
    } catch {
      if (!response.ok) {
        throw new ZotigodRequestError(
          response.status,
          response.statusText,
          `The configured daemon at ${daemonBaseUrl} returned ${response.status} ${response.statusText} for ${path}. Verify that this address points to zotigod.`,
        );
      }
      throw new Error(`zotigod returned invalid JSON for ${path}`);
    }
  }

  if (!response.ok) {
    const error = parseApiError(parsedBody);
    throw new ZotigodRequestError(response.status, response.statusText, error.message || trimmedBody, error.code);
  }
  if (trimmedBody === "") {
    return undefined;
  }

  return unwrapApiResponse(parsedBody, path);
}

function unwrapApiResponse(value: unknown, path: string): unknown {
  const record = expectRecord(value, `zotigod response for ${path}`);
  const code = record.code;
  if (code === undefined) {
    return value;
  }
  if (code !== "ok") {
    const message = expectOptionalString(record.message, `zotigod response for ${path} message`);
    throw new Error(message || `zotigod returned ${String(code)} for ${path}`);
  }
  return record.data;
}

function parseApiError(value: unknown): { code?: string; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { message: "" };
  }
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : "",
  };
}

function parseHealthResponse(value: unknown): HealthResponse {
  const record = expectRecord(value, "health response");
  const response = {
    status: expectString(record.status, "health response status"),
    protocol_version: expectString(record.protocol_version, "health response protocol_version"),
  };
  if (response.status !== "ok" || response.protocol_version !== "1") {
    throw new Error("zotigod health response is incompatible");
  }
  return response;
}

function parseCatalogProject(value: unknown, context: string): CatalogProject {
  const record = expectRecord(value, context);
  return {
    id: expectString(record.id, `${context} id`),
    name: expectString(record.name, `${context} name`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseCatalogProjectDetail(value: unknown, context: string): CatalogProjectDetail {
  const project = parseCatalogProject(value, context);
  const record = expectRecord(value, context);
  return {
    ...project,
    sources: expectArray(record.sources, `${context} sources`)
      .map((source, index) => parseCatalogSource(source, `${context} sources[${index}]`)),
  };
}

function parseCatalogSource(value: unknown, context: string): CatalogSource {
  const record = expectRecord(value, context);
  const kind = expectString(record.kind, `${context} kind`);
  if (kind !== "git" && kind !== "folder") throw new Error(`${context} kind is not supported: ${kind}`);
  const folderMode = expectOptionalString(record.folder_mode, `${context} folder_mode`);
  if (folderMode !== undefined && folderMode !== "direct" && folderMode !== "reference" && folderMode !== "copy") {
    throw new Error(`${context} folder_mode is not supported: ${folderMode}`);
  }
  return {
    id: expectString(record.id, `${context} id`),
    project_id: expectString(record.project_id, `${context} project_id`),
    kind,
    canonical_path: expectString(record.canonical_path, `${context} canonical_path`),
    git_common_dir: expectOptionalString(record.git_common_dir, `${context} git_common_dir`),
    git_object_format: expectOptionalString(record.git_object_format, `${context} git_object_format`),
    folder_mode: folderMode,
    source_key: expectString(record.source_key, `${context} source_key`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseCatalogSourceInspection(value: unknown, context: string): CatalogSourceInspection {
  const record = expectRecord(value, context);
  const kind = expectString(record.kind, `${context} kind`);
  if (kind !== "git" && kind !== "folder") throw new Error(`${context} kind is not supported: ${kind}`);
  return {
    kind,
    canonical_path: expectString(record.canonical_path, `${context} canonical_path`),
    git_common_dir: expectOptionalString(record.git_common_dir, `${context} git_common_dir`),
    git_object_format: expectOptionalString(record.git_object_format, `${context} git_object_format`),
    source_key: expectString(record.source_key, `${context} source_key`),
  };
}

function parseCatalogWorkspace(value: unknown, context: string): CatalogWorkspace {
  const record = expectRecord(value, context);
  const status = expectString(record.status, `${context} status`);
  if (!catalogWorkspaceStatuses.has(status as WorkspaceStatus)) throw new Error(`${context} status is not supported: ${status}`);
  return {
    id: expectString(record.id, `${context} id`),
    project_id: expectString(record.project_id, `${context} project_id`),
    title: expectString(record.title, `${context} title`),
    root_path: expectString(record.root_path, `${context} root_path`),
    status: status as WorkspaceStatus,
    error: expectOptionalString(record.error, `${context} error`),
    archived_at: expectOptionalString(record.archived_at, `${context} archived_at`),
    deleted_at: expectOptionalString(record.deleted_at, `${context} deleted_at`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseCatalogWorkspaceSource(value: unknown, context: string): CatalogWorkspaceSource {
  const record = expectRecord(value, context);
  const mode = expectOptionalString(record.mode, `${context} mode`);
  if (mode !== undefined && mode !== "direct" && mode !== "reference" && mode !== "copy") {
    throw new Error(`${context} mode is not supported: ${mode}`);
  }
  return {
    source: parseCatalogSource(record.source, `${context} source`),
    mode,
    target_path: expectString(record.target_path, `${context} target_path`),
    base_ref: expectOptionalString(record.base_ref, `${context} base_ref`),
    base_commit: expectOptionalString(record.base_commit, `${context} base_commit`),
    branch_name: expectOptionalString(record.branch_name, `${context} branch_name`),
    worktree_path: expectOptionalString(record.worktree_path, `${context} worktree_path`),
    status: expectString(record.status, `${context} status`),
    error: expectOptionalString(record.error, `${context} error`),
  };
}

function parseCatalogSessionProjection(value: unknown, context: string): CatalogSessionProjection {
  const record = expectRecord(value, context);
  const organizationValue = record.organization;
  return {
    runtime: record.runtime === null || record.runtime === undefined ? null : parseSession(record.runtime, `${context} runtime`),
    organization: organizationValue === null || organizationValue === undefined
      ? null
      : parseCatalogSessionOrganization(organizationValue, `${context} organization`),
    availability: expectString(record.availability, `${context} availability`),
  };
}

function parseCatalogSessionOrganization(value: unknown, context: string): CatalogSessionProjection["organization"] {
  const record = expectRecord(value, context);
  return {
    session_id: expectString(record.session_id, `${context} session_id`),
    project_id: expectNullableString(record.project_id, `${context} project_id`),
    workspace_id: expectNullableString(record.workspace_id, `${context} workspace_id`),
    title: expectNullableString(record.title, `${context} title`),
    pinned_at: expectNullableString(record.pinned_at, `${context} pinned_at`),
    pinned_position: expectNullableNumber(record.pinned_position, `${context} pinned_position`),
    workspace_position: expectNullableNumber(record.workspace_position, `${context} workspace_position`),
    self_archived_at: expectNullableString(record.self_archived_at, `${context} self_archived_at`),
    workspace_archived_at: expectNullableString(record.workspace_archived_at, `${context} workspace_archived_at`),
    revision: expectNumber(record.revision, `${context} revision`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseWorkspaceArchivePreview(value: unknown, context: string): WorkspaceArchivePreview {
  const record = expectRecord(value, context);
  return {
    workspace_id: expectString(record.workspace_id, `${context} workspace_id`),
    workspace_title: "",
    root_path: "",
    worktree_paths: expectStringList(record.worktree_paths, `${context} worktree_paths`),
    dirty_worktree_paths: expectStringList(record.dirty_worktree_paths, `${context} dirty_worktree_paths`),
  };
}

function parseWorkspaceDeletePreview(value: unknown, context: string): WorkspaceDeletePreview {
  const record = expectRecord(value, context);
  if (record.preserves_local_branches !== true) {
    throw new Error("Update zotigod before deleting a Workspace: this daemon does not guarantee preservation of local Git branches.");
  }
  const archive = parseWorkspaceArchivePreview(value, context);
  return {
    ...archive,
    root_path: expectString(record.workspace_root, `${context} workspace_root`),
    session_ids: expectStringList(record.session_ids, `${context} session_ids`),
    local_branches: expectStringList(record.local_branches, `${context} local_branches`),
    preserves_sources: expectBoolean(record.preserves_sources, `${context} preserves_sources`),
    preserves_runtime_sessions: expectBoolean(record.preserves_runtime_sessions, `${context} preserves_runtime_sessions`),
    preserves_remote_refs: expectBoolean(record.preserves_remote_refs, `${context} preserves_remote_refs`),
    preserves_local_branches: true,
  };
}

function parseSessionListResponse(value: unknown): SessionListResponse {
  const record = expectRecord(value, "session list response");
  if (!Array.isArray(record.sessions)) {
    throw new Error("session list response sessions must be an array");
  }

  return {
    sessions: record.sessions.map((session, index) => parseSession(session, `session list response sessions[${index}]`)),
  };
}

function parseSession(value: unknown, context: string): ZotigoSession {
  const record = expectRecord(value, context);
  const state = expectString(record.state, `${context} state`);
  if (!isSessionState(state)) {
    throw new Error(`${context} state is not supported: ${state}`);
  }
  const approvalPolicy = expectString(record.approval_policy, `${context} approval_policy`);
  if (!isApprovalPolicy(approvalPolicy)) {
    throw new Error(`${context} approval_policy is not supported: ${approvalPolicy}`);
  }

  return {
    id: expectString(record.id, `${context} id`),
    state,
    live: expectOptionalBoolean(record.live, `${context} live`) ?? state !== "offline",
    working_directory: expectOptionalString(record.working_directory, `${context} working_directory`),
    profile: expectOptionalString(record.profile, `${context} profile`),
    agent: parseOptionalAgentKind(record.agent, `${context} agent`),
    model: expectOptionalString(record.model, `${context} model`),
    reasoning_effort: expectOptionalString(record.reasoning_effort, `${context} reasoning_effort`),
    approval_policy: approvalPolicy,
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectOptionalString(record.updated_at, `${context} updated_at`),
    started_at: expectOptionalString(record.started_at, `${context} started_at`),
    ended_at: expectOptionalString(record.ended_at, `${context} ended_at`),
    error: expectOptionalString(record.error, `${context} error`),
    error_code: expectOptionalString(record.error_code, `${context} error_code`),
    working: expectOptionalBoolean(record.working, `${context} working`) ?? false,
    active_tool: expectOptionalString(record.active_tool, `${context} active_tool`),
    context_usage: parseOptionalContextUsage(record.context_usage, `${context} context_usage`),
  };
}

function parseSessionItemsResponse(value: unknown, context: string): SessionItemsResponse {
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

function parseDisplayItem(value: unknown, context: string): DisplayItem {
  const record = expectRecord(value, context);
  const type = expectString(record.type, `${context} type`);
  if (!isDisplayItemType(type)) {
    throw new Error(`${context} type is not supported: ${type}`);
  }

  return {
    id: expectString(record.id, `${context} id`),
    sequence: expectNumber(record.sequence, `${context} sequence`),
    type,
    role: expectOptionalString(record.role, `${context} role`),
    content: parseOptionalArray(record.content, `${context} content`, parseDisplayContentPart),
    turn: record.turn === undefined || record.turn === null ? undefined : parseDisplayTurn(record.turn, `${context} turn`),
    approval:
      record.approval === undefined || record.approval === null
        ? undefined
        : parseDisplayApproval(record.approval, `${context} approval`),
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

function parseDisplayContextCompaction(value: unknown, context: string) {
  const record = expectRecord(value, context);
  return {
    original_tokens: expectNumber(record.original_tokens, `${context} original_tokens`),
    compressed_tokens: expectNumber(record.compressed_tokens, `${context} compressed_tokens`),
    messages_before: expectNumber(record.messages_before, `${context} messages_before`),
    messages_after: expectNumber(record.messages_after, `${context} messages_after`),
  };
}

function parseProfilesResponse(value: unknown): ProfilesResponse {
  const record = expectRecord(value, "profiles response");
  if (!Array.isArray(record.profiles)) {
    throw new Error("profiles response profiles must be an array");
  }
  return {
    default_profile: expectString(record.default_profile, "profiles response default_profile"),
    profiles: record.profiles.map((value, index) => {
      const profile = expectRecord(value, `profiles response profiles[${index}]`);
      return {
        name: expectString(profile.name, `profiles response profiles[${index}] name`),
        provider: expectString(profile.provider, `profiles response profiles[${index}] provider`),
        model: expectString(profile.model, `profiles response profiles[${index}] model`),
        thinking_level: expectOptionalString(profile.thinking_level, `profiles response profiles[${index}] thinking_level`),
      };
    }),
  };
}

function parseAgentCatalogResponse(value: unknown): AgentCatalogResponse {
  const record = expectRecord(value, "agent catalog response");
  const defaultAgent = parseAgentKind(record.default_agent, "agent catalog response default_agent");
  return {
    default_agent: defaultAgent,
    agents: expectArray(record.agents, "agent catalog response agents")
      .map((agent, index) => parseAgentCatalogEntry(agent, `agent catalog response agents[${index}]`)),
  };
}

function parseAgentCatalogEntry(value: unknown, context: string): AgentCatalogEntry {
  const record = expectRecord(value, context);
  const availability = expectString(record.availability, `${context} availability`);
  if (availability !== "available" && availability !== "installed") {
    throw new Error(`${context} availability is not supported: ${availability}`);
  }
  const capabilities = expectRecord(record.capabilities, `${context} capabilities`);
  return {
    id: parseAgentKind(record.id, `${context} id`),
    label: expectString(record.label, `${context} label`),
    availability,
    version: expectOptionalString(record.version, `${context} version`),
    capabilities: {
      profiles: expectBoolean(capabilities.profiles, `${context} capabilities.profiles`),
      models: expectBoolean(capabilities.models, `${context} capabilities.models`),
      projects: expectOptionalBoolean(capabilities.projects, `${context} capabilities.projects`),
      steering: expectBoolean(capabilities.steering, `${context} capabilities.steering`),
      approvals: expectBoolean(capabilities.approvals, `${context} capabilities.approvals`),
    },
    models: record.models === undefined
      ? undefined
      : expectArray(record.models, `${context} models`).map((modelValue, index) => {
          const model = expectRecord(modelValue, `${context} models[${index}]`);
          return {
            id: expectString(model.id, `${context} models[${index}] id`),
            display_name: expectString(model.display_name, `${context} models[${index}] display_name`),
            is_default: expectBoolean(model.is_default, `${context} models[${index}] is_default`),
            supported_reasoning_efforts: expectStringArray(
              model.supported_reasoning_efforts,
              `${context} models[${index}] supported_reasoning_efforts`,
            ),
          };
        }),
  };
}

function parseAgentKind(value: unknown, context: string): AgentKind {
  const agent = expectString(value, context);
  if (agent !== "zotigo" && agent !== "codex") {
    throw new Error(`${context} is not supported: ${agent}`);
  }
  return agent;
}

function parseOptionalAgentKind(value: unknown, context: string): AgentKind | undefined {
  return value === undefined || value === null ? undefined : parseAgentKind(value, context);
}

function parseChangeProfileResponse(value: unknown): ChangeProfileResponse {
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

function parseChangeApprovalPolicyResponse(value: unknown): ChangeApprovalPolicyResponse {
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

function parseTitleSuggestionResponse(value: unknown): TitleSuggestionResponse {
  const record = expectRecord(value, "title suggestion response");
  return {
    title: expectString(record.title, "title suggestion response title"),
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

function parseSessionCommandResponse(value: unknown, context: string): SessionCommandResponse {
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

function parseOptionalContextUsage(value: unknown, context: string) {
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

function parseApprovalDecisionResponse(value: unknown): ApprovalDecisionResponse {
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
  };
}

function parseSkillsResponse(value: unknown): SkillsResponse {
  const record = expectRecord(value, "skills response");
  return {
    skills: parseOptionalArray(record.skills, "skills response skills", (skill, context) => {
      const entry = expectRecord(skill, context);
      return {
        name: expectString(entry.name, `${context} name`),
        description: expectString(entry.description, `${context} description`),
        scope: expectString(entry.scope, `${context} scope`),
        enabled: expectBoolean(entry.enabled, `${context} enabled`),
      };
    }) ?? [],
    diagnostics: parseOptionalArray(record.diagnostics, "skills response diagnostics", (diagnostic, context) => {
      const entry = expectRecord(diagnostic, context);
      return {
        code: expectString(entry.code, `${context} code`),
        message: expectString(entry.message, `${context} message`),
        scope: expectOptionalString(entry.scope, `${context} scope`),
        name: expectOptionalString(entry.name, `${context} name`),
      };
    }) ?? [],
  };
}

function parseCommandImageMetadata(value: unknown, context: string) {
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

function expectRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  return value;
}

function expectStringArray(value: unknown, context: string): string[] {
  return expectArray(value, context).map((item, index) => expectString(item, `${context}[${index}]`));
}

function expectStringList(value: unknown, context: string): string[] {
  return expectArray(value, context).map((item, index) => expectString(item, `${context}[${index}]`));
}

function expectNullableString(value: unknown, context: string): string | null {
  return value === null || value === undefined ? null : expectString(value, context);
}

function expectNullableNumber(value: unknown, context: string): number | null {
  return value === null || value === undefined ? null : expectNumber(value, context);
}

function expectNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a number`);
  }
  return value;
}

function expectBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean`);
  }
  return value;
}

function expectString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string`);
  }
  return value;
}

function expectOptionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectNumber(value, context);
}

function expectOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectString(value, context);
}

function expectOptionalBoolean(value: unknown, context: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectBoolean(value, context);
}

function parseOptionalArray<T>(
  value: unknown,
  context: string,
  parseItem: (value: unknown, context: string) => T,
): T[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
  return value.map((item, index) => parseItem(item, `${context}[${index}]`));
}

function isSessionState(value: string): value is SessionState {
  return sessionStates.has(value as SessionState);
}

function isApprovalPolicy(value: string): value is ApprovalPolicy {
  return approvalPolicies.has(value as ApprovalPolicy);
}

function parseOptionalApprovalPolicy(value: unknown, context: string): ApprovalPolicy | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const policy = expectString(value, context);
  if (!isApprovalPolicy(policy)) {
    throw new Error(`${context} is not supported: ${policy}`);
  }
  return policy;
}

function isDisplayItemType(value: string): value is DisplayItemType {
  return displayItemTypes.has(value as DisplayItemType);
}
