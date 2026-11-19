import { fetchDaemon } from "../daemonHttp";
import type { DisplayDelta, SessionDisplayEvent } from "../../shared/zotigod";
import { expectRecord, expectString, expectOptionalString } from "./validation";
import { ZotigodRequestError, UnsupportedSessionEventsError, getDaemonConfig } from "./http";
import { parseDisplayItem, parseDisplaySubagent } from "./displayParsers";

export async function streamSessionEvents(
  id: string | null,
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
  const path = id === null ? "/catalog/activity" : `/sessions/${encodeURIComponent(id)}/events${search ? `?${search}` : ""}`;
  const response = await fetchDaemon(`${getDaemonConfig().baseUrl}${path}`, {
    headers: { Accept: "text/event-stream", "X-Zotigo-Runtime-Updates": "true" },
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
  const cancelReader = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    await onConnected();
    const decoder = new TextDecoder();
    let buffer = "";
    let frame: SseFrame = emptySseFrame();

    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw signal.reason;
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
    signal.removeEventListener("abort", cancelReader);
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
  if (frame.event === "activity") {
    const snapshot = expectRecord(data, "session activity");
    const revision = snapshot.revision;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid activity revision");
    const active = Object.entries(expectRecord(snapshot.active, "active sessions")).map(([id, state]) => {
      if (state !== "starting" && state !== "running" && state !== "paused" && state !== "pausing") throw new Error("Invalid active session state");
      return [id, state] as const;
    });
    return {type: "activity", revision, active: Object.fromEntries(active)};
  }
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
    ...(record.before_input_id === undefined ? {} : { before_input_id: expectOptionalString(record.before_input_id, "session event before_input_id") }),
    item_id: expectString(record.item_id, "session event delta item_id"),
    role,
    part_type: partType,
    delta: expectString(record.delta, "session event delta delta"),
  };
  if (toolCallID !== undefined) delta.tool_call_id = toolCallID;
  if (toolName !== undefined) delta.tool_name = toolName;
  if (record.subagent !== undefined && record.subagent !== null) {
    delta.subagent = parseDisplaySubagent(record.subagent, "session event delta subagent");
  }
  return delta;
}
