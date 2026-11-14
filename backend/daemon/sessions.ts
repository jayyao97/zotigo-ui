import type { SessionReadState, ApprovalPolicy, ApprovalDecisionInput, ApprovalDecisionResponse, InteractionResponse, ChangeApprovalPolicyResponse, CodexSettingsInput, ChangeProfileResponse, MessageImageInput, SessionCommandResponse, CreateSessionInput, SessionItemsQuery, SessionItemsResponse, TitleSuggestionResponse, ZotigoSession } from "../../shared/zotigod";
import { expectRecord, expectNumber, expectBoolean, expectString, expectOptionalNumber } from "./validation";
import { ZotigodRequestError, jsonRequest, requestJSON } from "./http";
import { parseSessionListResponse, parseSessionReadState, parseSession, parseChangeProfileResponse, parseChangeApprovalPolicyResponse, parseTitleSuggestionResponse, parseSessionCommandResponse } from "./sessionParsers";
import { parseSessionItemsResponse, parseApprovalDecisionResponse, parseInteractionResponse } from "./displayParsers";

export async function listSessions(): Promise<ZotigoSession[]> {
  const response = parseSessionListResponse(await requestJSON("/sessions"));
  return response.sessions;
}

export function createSession(input: CreateSessionInput = {}): Promise<ZotigoSession & { workspace_position?: number }> {
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
  }).then((value) => ({
    ...parseSession(value, "create session response"),
    workspace_position: expectOptionalNumber(expectRecord(value, "create session response").workspace_position, "create session workspace_position"),
  }));
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

export function submitSessionInteraction(
  id: string,
  interactionId: string,
  answers: Record<string, string[]>,
): Promise<InteractionResponse> {
  return requestJSON(
    `/sessions/${encodeURIComponent(id)}/interactions/${encodeURIComponent(interactionId)}`,
    {
      method: "POST",
      body: JSON.stringify({ answers }),
      headers: { "Content-Type": "application/json" },
    },
  ).then((value) => parseInteractionResponse(value, "interaction response"));
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

export function forkSession(id: string, requestId: string, throughTurnId?: string): Promise<ZotigoSession> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId, through_turn_id: throughTurnId }),
  }).then((value) => parseSession(value, "fork session response"));
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
  clientMessageId?: string,
): Promise<SessionCommandResponse> {
  return postSessionTextCommand(id, "messages", text, "send session message response", images, skills, clientMessageId);
}

export async function queueSessionMessage(id: string, text: string, images: MessageImageInput[], skills: string[], clientMessageId?: string) {
  try {
    return await postSessionTextCommand(id, "queue", text, "queue message response", images, skills, clientMessageId);
  } catch (error) {
    if (error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) {
      throw new Error("Queue is unavailable for this session. Update the connected daemon to use queued messages.");
    }
    throw error;
  }
}

export async function listQueuedInputs(id: string): Promise<import("../../shared/zotigod").QueuedInput[] | null> {
  let data: unknown;
  try { data = await requestJSON(`/sessions/${encodeURIComponent(id)}/queue`); }
  catch (error) {
    if (error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) return null;
    throw error;
  }
  const response = expectRecord(data, "input queue");
  if (!Array.isArray(response.items)) throw new Error("Invalid input queue");
  return response.items.map(value => {
    const row = expectRecord(value, "queued input");
    if (row.state !== "queued" && row.state !== "paused" && row.state !== "sending") throw new Error("Invalid queue state");
    if (typeof row.editable !== "boolean") throw new Error("Invalid queue editable flag");
    return { ...parseSessionCommandResponse(value, "queued input"), state: row.state, revision: expectNumber(row.revision, "revision"), editable: row.editable, image_editing_supported: row.image_editing_supported === true };
  });
}

export async function listCompletionTriggers(id: string, targetId?: string): Promise<{ id: string; title: string; on_fire: string; expires_at: string; state?: "pending" | "fired" | "cancelled" | "expired" }[] | null> {
  let data: unknown;
  try { data = await requestJSON(`/sessions/${encodeURIComponent(id)}/completion-triggers?include_history=true${targetId ? `&target=${encodeURIComponent(targetId)}` : ""}`); }
  catch (error) {
    if (error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) return null;
    throw error;
  }
  const response = expectRecord(data, "completion triggers");
  if (!Array.isArray(response.items)) throw new Error("Invalid completion triggers");
  return response.items.map(value => {
    const row = expectRecord(value, "completion trigger");
    if (row.state !== undefined && !["pending", "fired", "cancelled", "expired"].includes(String(row.state))) throw new Error("Invalid completion trigger state");
    return { ...(row.state === undefined ? {} : { state: row.state as "pending" | "fired" | "cancelled" | "expired" }), id: expectString(row.id, "trigger id"), title: expectString(row.title, "title"), on_fire: expectString(row.on_fire, "on_fire"), expires_at: expectString(row.expires_at, "expires_at") };
  });
}

export async function cancelCompletionTrigger(id: string, triggerId: string): Promise<void> {
  await requestJSON(`/sessions/${encodeURIComponent(id)}/completion-triggers/${encodeURIComponent(triggerId)}`, { method: "DELETE" });
}

export async function changeQueuedInput(id: string, itemId: string, revision: number, text?: string, imageIndices?: number[]): Promise<void> {
  if (imageIndices !== undefined) {
    const items = await listQueuedInputs(id);
    if (!items?.find(item => item.id === itemId)?.image_editing_supported) {
      throw new Error("Update the connected daemon to remove queued images. No changes were saved.");
    }
  }
  await requestJSON(`/sessions/${encodeURIComponent(id)}/queue/${encodeURIComponent(itemId)}`, {
    method: text === undefined ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, text, image_indices: imageIndices }),
  });
}

export async function resumeInputQueue(id: string): Promise<void> {
  await requestJSON(`/sessions/${encodeURIComponent(id)}/queue/resume`, { method: "POST" });
}

export async function sendQueuedInput(id: string, itemId: string, revision: number): Promise<void> {
  await requestJSON(`/sessions/${encodeURIComponent(id)}/queue/${encodeURIComponent(itemId)}/send`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }),
  });
}

export function sendSessionSteering(
  id: string,
  text: string,
  images: MessageImageInput[] = [],
  skills: string[] = [],
  clientMessageId?: string,
): Promise<SessionCommandResponse> {
  return postSessionTextCommand(id, "steering", text, "send session steering response", images, skills, clientMessageId);
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
  return requestJSON(path, { headers: { "X-Zotigo-Runtime-Updates": "true" } }).then((value) => parseSessionItemsResponse(value, "session items response"));
}

export function suggestSessionTitle(id: string): Promise<TitleSuggestionResponse> {
  return requestJSON(`/sessions/${encodeURIComponent(id)}/title-suggestion`, {
    method: "POST",
  }).then(parseTitleSuggestionResponse);
}

function postSessionTextCommand(
  id: string,
  action: "messages" | "steering" | "queue",
  text: string,
  context: string,
  images: MessageImageInput[] = [],
  skills: string[] = [],
  clientMessageId?: string,
): Promise<SessionCommandResponse> {
  const payload = {
    text,
    ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(skills.length > 0 ? { skills } : {}),
  };
  return requestJSON(`/sessions/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  }).then((value) => parseSessionCommandResponse(value, context));
}

export async function setSessionReadState(id: string, readVersion: number | null): Promise<SessionReadState> {
  return parseSessionReadState(await requestJSON(`/sessions/${encodeURIComponent(id)}/read-state`, jsonRequest("PUT", readVersion === null ? { unread: true } : { read_version: readVersion })), "session read state");
}

export async function translateSelection(id: string, text: string, targetLanguage: string, profile?: string): Promise<import("../../shared/clientTypes").TranslationResult> {
  const value = await requestJSON(`/sessions/${encodeURIComponent(id)}/translate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(35000), body: JSON.stringify({ text, target_language: targetLanguage, ...(profile ? { profile } : {}) }),
  });
  const result = expectRecord(value, "translation");
  return { text: expectString(result.text, "translation text"), profile: typeof result.profile === "string" ? result.profile : undefined, model: typeof result.model === "string" ? result.model : undefined };
}

export async function searchSession(id: string, query: string): Promise<import("../../shared/zotigod").SessionSearchResponse> {
  const value = expectRecord(await requestJSON(`/sessions/${encodeURIComponent(id)}/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000) }), "session search");
  if (!Array.isArray(value.hits)) throw new Error("search hits must be an array");
  return { truncated: expectBoolean(value.truncated, "search truncated"), hits: value.hits.map(raw => {
    const hit = expectRecord(raw, "search hit");
    return { id: expectString(hit.id, "hit id"), sequence: expectNumber(hit.sequence, "hit sequence") };
  }) };
}
export function getSessionItemWindow(id: string, target: number | string): Promise<SessionItemsResponse> {
  const query = typeof target === "number" ? `sequence=${target}` : `message_id=${encodeURIComponent(target)}`;
  return requestJSON(`/sessions/${encodeURIComponent(id)}/items/window?${query}`, { signal: AbortSignal.timeout(5000) }).then(value => parseSessionItemsResponse(value, "message window"));
}
