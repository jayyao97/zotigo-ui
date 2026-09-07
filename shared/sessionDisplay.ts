import type { CommandImageMetadata, DisplayDelta, DisplayItem, DisplayToolCall, DisplayToolResult, SessionCommandResponse, SessionState, ZotigoSession } from "./zotigod";
import type { DaemonSessionBinding } from "./clientTypes";

export interface EphemeralDisplayBlock {
  id: string;
  partType: "text" | "reasoning" | "tool_progress";
  text: string;
  createdAt: string;
  toolCallID?: string;
  toolName?: string;
}

export interface ToolRenderProjection {
  resultsByCall: Map<string, DisplayToolResult>;
  progressByCall: Map<string, string>;
  consumedResults: Set<string>;
}

export interface OptimisticPromptInput {
  id: string;
  text: string;
  images?: CommandImageMetadata[];
  skills?: string[];
  steering: boolean;
  createdAt: string;
}

export type TimelineDisplayGroup =
  | { kind: "item"; item: DisplayItem }
  | { kind: "tools"; items: DisplayItem[]; active: boolean }
  | { kind: "reasoning"; items: DisplayItem[] };

export type ReasoningDisplayGroup =
  | { kind: "item"; item: DisplayItem }
  | { kind: "reasoning"; items: DisplayItem[] };

const toolProgressPreviewLimit = 16 * 1024;

export function sessionAllowsActiveTurn(state: SessionState | undefined): boolean {
  return state === undefined || state === "starting" || state === "running" || state === "paused";
}

export function selectedTimelineActivity({
  conversationId,
  sessionId,
  loadedSessionId,
  sessionState,
  loading,
  hasActiveTurn,
}: {
  conversationId?: string;
  sessionId?: string;
  loadedSessionId: string | null;
  sessionState?: SessionState;
  loading: boolean;
  hasActiveTurn: boolean;
}): { conversationId: string; working: boolean } | undefined {
  if (!conversationId || !sessionId || loading || loadedSessionId !== sessionId) return undefined;
  return {
    conversationId,
    working: sessionAllowsActiveTurn(sessionState) && hasActiveTurn,
  };
}

export function workingConversationIds(
  bindings: DaemonSessionBinding[],
  sessions: ZotigoSession[],
  selectedActivity?: { conversationId: string; working: boolean },
): Set<string> {
  const sessionsByID = new Map(sessions.map((session) => [session.id, session]));
  const working = new Set(bindings.flatMap((binding) => {
    const session = sessionsByID.get(binding.daemon_session_id);
    return session?.working && sessionAllowsActiveTurn(session.state) ? [binding.conversation_id] : [];
  }));
  if (selectedActivity) {
    if (selectedActivity.working) {
      working.add(selectedActivity.conversationId);
    } else {
      working.delete(selectedActivity.conversationId);
    }
  }
  return working;
}

export function mergeDisplayItems(current: DisplayItem[], incoming: DisplayItem[]): DisplayItem[] {
  const bySequence = new Map<number, DisplayItem>();
  const sequenceById = new Map<string, number>();
  for (const item of [...current, ...incoming]) {
    const previousSequence = sequenceById.get(item.id);
    if (previousSequence !== undefined && previousSequence !== item.sequence) {
      bySequence.delete(previousSequence);
    }
    const displaced = bySequence.get(item.sequence);
    if (displaced && displaced.id !== item.id) {
      sequenceById.delete(displaced.id);
    }
    bySequence.set(item.sequence, item);
    sequenceById.set(item.id, item.sequence);
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
}

export function visibleDisplayItems(items: DisplayItem[]): DisplayItem[] {
  const resolvedApprovalIds = new Set(
    items
      .filter((item) => item.type === "approval_decision")
      .map((item) => item.approval?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const duplicateSyncedUserIDs = duplicateSyncedUserItemIDs(items);

  return items.filter((item) => {
    if (duplicateSyncedUserIDs.has(item.id)) return false;
    if (isTurnTerminalItem(item)) return false;
    if (item.type === "approval_request" && item.approval?.id && resolvedApprovalIds.has(item.approval.id)) {
      return false;
    }
    if (item.type === "approval_decision") {
      return Boolean(item.approval?.decisions?.some((decision) => !decision.approved));
    }
    return true;
  });
}

function duplicateSyncedUserItemIDs(items: DisplayItem[]): Set<string> {
  const sequenceItems = [...items].sort((left, right) => left.sequence - right.sequence);
  const localUserKeyByTurn = new Map<string, string>();
  const terminalByTurn = new Map<string, DisplayItem>();
  for (const [index, item] of sequenceItems.entries()) {
    const turnID = item.turn?.id;
    if (item.type === "turn_started" && turnID && index > 0) {
      const previous = sequenceItems[index - 1];
      const key = previous.type === "user_message" && !previous.turn?.id
        ? userContentKey(previous.content)
        : null;
      if (key) localUserKeyByTurn.set(turnID, key);
    }
    if (isTurnTerminalItem(item) && turnID) {
      terminalByTurn.set(turnID, item);
    }
  }

  const duplicateIDs = new Set<string>();
  for (const item of sequenceItems) {
    const turnID = item.turn?.id;
    const terminal = turnID ? terminalByTurn.get(turnID) : undefined;
    if (
      item.type === "user_message"
      && turnID
      && terminal
      && item.sequence > terminal.sequence
      && userContentKey(item.content) === localUserKeyByTurn.get(turnID)
    ) {
      duplicateIDs.add(item.id);
    }
  }
  return duplicateIDs;
}

function userContentKey(content: DisplayItem["content"]): string | null {
  if (!content || content.length === 0) return null;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type === "text") {
      parts.push(`text\0${part.text ?? ""}`);
      continue;
    }
    if (part.type === "image" && part.image?.url) {
      const path = part.image.url.split("?", 1)[0];
      const name = path.split(/[\\/]/).pop();
      if (!name) return null;
      parts.push(`image\0${name}`);
      continue;
    }
    return null;
  }
  return parts.join("\x1e");
}

export function orderLateTurnItems(items: DisplayItem[]): DisplayItem[] {
  const terminalByTurn = new Map<string, DisplayItem>();
  for (const item of items) {
    if (isFinalTurnItem(item) && item.turn?.id) {
      terminalByTurn.set(item.turn.id, item);
    }
  }

  const lateByTurn = new Map<string, DisplayItem[]>();
  for (const item of items) {
    const turnID = item.turn?.id;
    const terminal = turnID ? terminalByTurn.get(turnID) : undefined;
    if (!turnID || !terminal || isTurnTerminalItem(item) || item.type === "turn_started" || item.sequence <= terminal.sequence) {
      continue;
    }
    lateByTurn.set(turnID, [...(lateByTurn.get(turnID) ?? []), item]);
  }
  if (lateByTurn.size === 0) return items;

  const lateIDs = new Set([...lateByTurn.values()].flat().map((item) => item.id));
  const ordered: DisplayItem[] = [];
  for (const item of items) {
    if (lateIDs.has(item.id)) continue;
    if (isFinalTurnItem(item) && item.turn?.id) {
      ordered.push(...(lateByTurn.get(item.turn.id) ?? []));
    }
    ordered.push(item);
  }
  return ordered;
}

export function hasUnresolvedTurnItems(items: DisplayItem[]): boolean {
  const startedTurns = new Set(
    items
      .filter((item) => item.type === "turn_started")
      .map((item) => item.turn?.id)
      .filter((turnID): turnID is string => Boolean(turnID)),
  );
  return items.some((item) => Boolean(item.turn?.id) && !startedTurns.has(item.turn?.id ?? ""));
}

export function optimisticSteeringDisplayItem(
  command: SessionCommandResponse,
  responseSessionID: string | undefined,
  selectedSessionID: string | null,
  durableItems: DisplayItem[],
): DisplayItem | null {
  if (command.type !== "steering" || !responseSessionID || responseSessionID !== selectedSessionID) {
    return null;
  }
  if (command.turn_id && durableItems.some(
    (item) => isFinalTurnItem(item) && item.turn?.id === command.turn_id,
  )) {
    return null;
  }
  const content: NonNullable<DisplayItem["content"]> = [];
  if (command.text) {
    content.push({ type: "text", text: command.text });
  }
  for (const image of command.images ?? []) {
    content.push({ type: "image", image });
  }
  const item: DisplayItem = {
    id: command.id,
    sequence: Number.MAX_SAFE_INTEGER,
    type: "steering_message",
    role: "user",
    content,
    turn: command.turn_id ? { id: command.turn_id } : undefined,
    command: {
      type: "steering",
      text: command.text,
      images: command.images,
      turn_id: command.turn_id,
    },
    created_at: command.created_at,
  };
  return reconcileOptimisticSteering([item], durableItems)[0] ?? null;
}

export function createOptimisticPromptId(): string {
  // Unlike randomUUID, getRandomValues is available on remote HTTP pages.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `optimistic-prompt-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function optimisticPromptDisplayItem(input: OptimisticPromptInput): DisplayItem {
  const content: NonNullable<DisplayItem["content"]> = [];
  if (input.text) content.push({ type: "text", text: input.text });
  for (const image of input.images ?? []) content.push({ type: "image", image });
  return {
    id: input.id,
    sequence: Number.MAX_SAFE_INTEGER,
    type: input.steering ? "steering_message" : "user_message",
    role: "user",
    content,
    command: input.skills?.length ? { skills: input.skills } : undefined,
    created_at: input.createdAt,
  };
}

export function acknowledgeOptimisticPrompt(
  item: DisplayItem,
  command: SessionCommandResponse,
  durableItems: DisplayItem[],
): DisplayItem | null {
  if (durableItems.some((durable) => durable.id === command.id)) return null;
  const content: NonNullable<DisplayItem["content"]> = [];
  if (command.text) content.push({ type: "text", text: command.text });
  for (const image of command.images ?? []) content.push({ type: "image", image });
  const steering = command.type === "steering";
  return {
    ...item,
    id: command.id,
    type: steering ? "steering_message" : "user_message",
    content,
    turn: steering && command.turn_id ? { id: command.turn_id } : undefined,
    command: {
      type: steering ? "steering" : "message",
      text: command.text,
      skills: command.skills,
      images: command.images,
      turn_id: command.turn_id,
    },
    created_at: command.created_at,
  };
}

export function reconcileOptimisticSteering(
  optimistic: DisplayItem[],
  durable: DisplayItem[],
): DisplayItem[] {
  const durableIDs = new Set(durable.map((item) => item.id));
  return optimistic.filter((item) => !durableIDs.has(item.id));
}

export function appendDisplayDelta(
  blocks: EphemeralDisplayBlock[],
  delta: DisplayDelta,
  durableItems: DisplayItem[],
): EphemeralDisplayBlock[] {
  if (durableItems.some((item) => item.id === delta.item_id)) {
    return blocks;
  }
  const index = blocks.findIndex((block) => block.id === delta.item_id);
  if (index === -1) {
    return [
      ...blocks,
      {
        id: delta.item_id,
        partType: delta.part_type,
        text: delta.delta,
        createdAt: new Date().toISOString(),
        toolCallID: delta.tool_call_id,
        toolName: delta.tool_name,
      },
    ];
  }
  const next = [...blocks];
  const text = next[index].text + delta.delta;
  next[index] = {
    ...next[index],
    text: delta.part_type === "tool_progress" && text.length > toolProgressPreviewLimit
      ? text.slice(-toolProgressPreviewLimit)
      : text,
  };
  return next;
}

export function appendDisplayDeltas(
  blocks: EphemeralDisplayBlock[],
  deltas: DisplayDelta[],
  durableItems: DisplayItem[],
): EphemeralDisplayBlock[] {
  return deltas.reduce(
    (current, delta) => appendDisplayDelta(current, delta, durableItems),
    blocks,
  );
}

export function reconcileDisplayPreviews(blocks: EphemeralDisplayBlock[], item: DisplayItem): EphemeralDisplayBlock[] {
  const completedToolCalls = new Set(
    (item.content ?? []).map((part) => part.tool_result?.tool_call_id).filter((id): id is string => Boolean(id)),
  );
  return blocks.filter((block) => block.id !== item.id && !completedToolCalls.has(block.toolCallID ?? ""));
}

export function ephemeralDisplayItems(blocks: EphemeralDisplayBlock[]): DisplayItem[] {
  return blocks.map((block, index) => ({
    id: block.id,
    sequence: Number.MAX_SAFE_INTEGER - blocks.length + index,
    type: "assistant_message",
    role: "assistant",
    content: block.partType === "tool_progress"
      ? [{
          type: "tool_progress",
          tool_result: { tool_call_id: block.toolCallID, tool_name: block.toolName, text: block.text },
        }]
      : [{ type: block.partType, text: block.text }],
    created_at: block.createdAt,
  }));
}

export function buildToolRenderProjection(items: DisplayItem[]): ToolRenderProjection {
  const resultsByCall = new Map<string, DisplayToolResult>();
  const progressByCall = new Map<string, string>();
  const consumedResults = new Set<string>();
  let pending = new Map<string, string[]>();

  for (const item of items) {
    if (item.type === "turn_started" || isFinalTurnItem(item)) {
      pending = new Map();
    }
    if (item.type !== "assistant_message") {
      continue;
    }
    for (const [index, part] of (item.content ?? []).entries()) {
      const location = contentLocation(item.id, index);
      const callId = part.tool_call?.id;
      if (part.type === "tool_call" && callId) {
        pending.set(callId, [...(pending.get(callId) ?? []), location]);
      }
      const result = part.tool_result;
      const resultId = result?.tool_call_id;
      if (part.type === "tool_progress" && resultId && result?.text) {
        progressByCall.set(resultId, result.text);
        continue;
      }
      if (part.type === "tool_result" && result && resultId) {
        const calls = pending.get(resultId);
        const callLocation = calls?.shift();
        if (callLocation) {
          resultsByCall.set(callLocation, result);
          consumedResults.add(location);
        }
      }
    }
  }
  return { resultsByCall, progressByCall, consumedResults };
}

export function latestPendingToolCall(items: DisplayItem[], toolName?: string): DisplayToolCall | null {
  let pending = new Map<string, DisplayToolCall>();
  for (const item of items) {
    if (item.type === "turn_started" || isFinalTurnItem(item)) {
      pending = new Map();
    }
    for (const part of item.content ?? []) {
      if (part.type === "tool_call" && part.tool_call?.id) {
        pending.set(part.tool_call.id, part.tool_call);
      }
      if (part.type === "tool_result" && part.tool_result?.tool_call_id) {
        pending.delete(part.tool_result.tool_call_id);
      }
    }
  }
  return [...pending.values()].reverse().find((call) => !toolName || call.name === toolName) ?? null;
}

export function contentLocation(itemId: string, index: number): string {
  return `${itemId}:${index}`;
}

export function hasVisibleAssistantContent(item: DisplayItem, projection: ToolRenderProjection): boolean {
  return (item.content ?? []).some((part, index) => {
    if (projection.consumedResults.has(contentLocation(item.id, index))) {
      return false;
    }
    if (part.type === "text") {
      return Boolean(part.text);
    }
    if (part.type === "image") {
      return Boolean(part.image?.url);
    }
    if (part.type === "reasoning" || part.type === "tool_call" || part.type === "tool_result") {
      return true;
    }
    return Boolean(part.text);
  });
}

export function groupTimelineItems(items: DisplayItem[], activeTurnSequence?: number): TimelineDisplayGroup[] {
  const groups: TimelineDisplayGroup[] = [];
  let pendingActivity: DisplayItem[] = [];

  const flushActivity = (atTimelineTail: boolean) => {
    if (pendingActivity.length === 0) return;
    const callCount = pendingActivity.reduce(
      (count, item) => count + (item.content ?? []).filter((part) => part.type === "tool_call").length,
      0,
    );
    const active = Boolean(
      atTimelineTail &&
      activeTurnSequence !== undefined &&
      pendingActivity.some((item) => item.sequence > activeTurnSequence),
    );
    if (callCount > 0 && (pendingActivity.length > 1 || active)) {
      groups.push({ kind: "tools", items: pendingActivity, active });
    } else {
      groups.push(...groupReasoningItems(pendingActivity));
    }
    pendingActivity = [];
  };

  for (const item of items) {
    const content = item.content ?? [];
    const isAssistant = item.type === "assistant_message" && content.length > 0;
    const isReasoning = isReasoningItem(item);
    const isToolActivity = isAssistant &&
      content.every((part) => part.type === "tool_call" || part.type === "tool_result" || part.type === "tool_progress");

    if (isReasoning || isToolActivity) {
      pendingActivity.push(item);
      continue;
    }
    flushActivity(
      item.type === "approval_request" &&
      activeTurnSequence !== undefined &&
      item.sequence > activeTurnSequence,
    );
    groups.push({ kind: "item", item });
  }
  flushActivity(true);
  return groups;
}

export function groupReasoningItems(items: DisplayItem[]): ReasoningDisplayGroup[] {
  const groups: ReasoningDisplayGroup[] = [];
  let reasoning: DisplayItem[] = [];
  const flushReasoning = () => {
    if (reasoning.length > 0) groups.push({ kind: "reasoning", items: reasoning });
    reasoning = [];
  };
  for (const item of items) {
    if (isReasoningItem(item)) {
      reasoning.push(item);
      continue;
    }
    flushReasoning();
    groups.push({ kind: "item", item });
  }
  flushReasoning();
  return groups;
}

function isReasoningItem(item: DisplayItem): boolean {
  const content = item.content ?? [];
  return item.type === "assistant_message" && content.length > 0 && content.every((part) => part.type === "reasoning");
}

function isFinalTurnItem(item: DisplayItem): boolean {
  return item.type === "turn_completed" || item.type === "turn_failed" || item.type === "turn_interrupted";
}

function isTurnTerminalItem(item: DisplayItem): boolean {
  return isFinalTurnItem(item) || item.type === "turn_paused";
}
