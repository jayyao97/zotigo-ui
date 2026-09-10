import { useMemo } from "react";
import type React from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import { buildToolRenderProjection } from "../../shared/sessionDisplay";
import type { DisplayContentPart, DisplayItem } from "../../shared/zotigod";
import {
  AssistantContentView,
  compactDisplayPaths,
  displayContentText,
  formatDisplayToolCall,
  formatDisplayToolResult,
  stringValue,
  toTitleCase,
  UserMessage,
} from "./ConversationTimeline";

type SubagentHistoryEntry = {
  role: string;
  text: string;
  content?: DisplayContentPart[];
};

export type SubagentRun = {
  id: string;
  name: string;
  description?: string;
  workdir?: string;
  status: "running" | "waiting_approval" | "completed" | "failed";
  history: SubagentHistoryEntry[];
};

export function buildSubagentRuns(items: DisplayItem[]): SubagentRun[] {
  const runs = new Map<string, SubagentRun>();
  for (const item of items) {
    const subagent = item.subagent;
    if (subagent?.tool_call_id) {
      const run = runs.get(subagent.tool_call_id) ?? {
        id: subagent.tool_call_id,
        name: subagent.name || "subagent",
        status: "running" as const,
        history: [],
      };
      runs.set(subagent.tool_call_id, run);
      if (run.status === "completed" || run.status === "failed") continue;
      run.name = subagent.name || run.name;
      run.description = subagent.description || run.description;
      run.workdir = subagent.workdir || run.workdir;
      run.status = subagent.status || run.status;
      const content = item.content ?? [];
      if (content.length > 0 || item.error) {
        const displayContent = content.length > 0 ? content : [{ type: "text", text: item.error! }];
        run.history.push({
          role: item.role || "assistant",
          text: subagentContentText(displayContent),
          content: displayContent,
        });
      }
      continue;
    }
    for (const part of item.content ?? []) {
      const call = part.tool_call;
      if (call?.name === "spawn" && call.id) {
        const args = parseJSONObject(call.arguments);
        const run = runs.get(call.id);
        if (run) {
          run.name = stringValue(args?.name) || stringValue(args?.description) || run.name;
          run.description = stringValue(args?.description) || run.description;
          run.workdir = stringValue(args?.workdir) || run.workdir;
        } else {
          runs.set(call.id, {
            id: call.id,
            name: stringValue(args?.name) || stringValue(args?.description) || "subagent",
            description: stringValue(args?.description),
            workdir: stringValue(args?.workdir),
            status: "running",
            history: [],
          });
        }
      }
      const result = part.tool_result;
      if (!result?.tool_call_id || result.tool_name !== "spawn") continue;
      const metadata = recordValue(result.metadata?.subagent);
      const run = runs.get(result.tool_call_id) ?? {
        id: result.tool_call_id,
        name: stringValue(metadata?.name) || "subagent",
        status: "running" as const,
        history: [],
      };
      runs.set(result.tool_call_id, run);
      run.status = result.is_error ? "failed" : "completed";
      run.name = stringValue(metadata?.name) || run.name;
      run.description = stringValue(metadata?.description) || run.description;
      run.workdir = stringValue(metadata?.workdir) || run.workdir;
      const finalHistory = subagentHistory(metadata?.history);
      if (finalHistory !== null) {
        run.history = finalHistory;
      } else if (run.history.length === 0) {
        run.history = fallbackSubagentHistory(result.text);
      }
    }
  }
  return [...runs.values()];
}

export function SubagentOverview({ runs, onSelect }: { runs: SubagentRun[]; onSelect: (id: string) => void }) {
  const active = runs.filter((run) => run.status === "running" || run.status === "waiting_approval");
  const done = runs.filter((run) => run.status === "completed" || run.status === "failed");
  return (
    <div className="subagent-overview">
      <SubagentSection title="Active" runs={active} empty="No active subagents" onSelect={onSelect} />
      <SubagentSection title="Done" runs={done} onSelect={onSelect} />
    </div>
  );
}

function SubagentSection({
  title,
  runs,
  empty,
  onSelect,
}: {
  title: string;
  runs: SubagentRun[];
  empty?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="subagent-section">
      <h2>{title} · {runs.length}</h2>
      {runs.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <div className="subagent-list">
          {runs.map((run) => (
            <button key={run.id} type="button" onClick={() => onSelect(run.id)}>
              <SubagentAvatar run={run} />
              <span className="subagent-list-copy">
                <strong>{run.name}</strong>
                <small>{subagentPreview(run)}</small>
              </span>
              <span className={`subagent-list-status ${run.status}`}>
                {(run.status === "running" || run.status === "waiting_approval") && <LoaderCircle size={12} strokeWidth={1.9} />}
                {subagentStatusLabel(run.status)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function SubagentTranscript({
  run,
  workspaceRoot,
  onBack,
}: {
  run?: SubagentRun;
  workspaceRoot?: string;
  onBack: () => void;
}) {
  const compact = (value?: string) => compactDisplayPaths(value, workspaceRoot) ?? "";
  const items = useMemo(() => subagentHistoryItems(run, workspaceRoot), [run, workspaceRoot]);
  const toolProjection = useMemo(() => buildToolRenderProjection(items), [items]);
  if (!run) {
    return <div className="subagent-panel-empty">Subagent is unavailable.</div>;
  }
  return (
    <div className="subagent-transcript">
      <header>
        <button type="button" aria-label="Back to subagents" onClick={onBack}><ArrowLeft size={14} strokeWidth={1.9} /></button>
        <SubagentAvatar run={run} />
        <strong>{run.name}</strong>
        <span className={`subagent-list-status ${run.status}`}>
          {(run.status === "running" || run.status === "waiting_approval") && <LoaderCircle size={12} strokeWidth={1.9} />}
          {subagentStatusLabel(run.status)}
        </span>
      </header>
      <div className="subagent-transcript-scroll">
        <div className="subagent-transcript-content">
          {run.description && <p className="subagent-transcript-objective">{run.description}</p>}
          {run.workdir && <code className="subagent-transcript-workdir">{compact(run.workdir)}</code>}
          {items.length === 0 ? (
            <div className="subagent-panel-empty">{run.status === "running" || run.status === "waiting_approval" ? subagentStatusLabel(run.status) : "No recorded history"}</div>
          ) : (
            <div className="display-log subagent-transcript-history">
              {items.map((item) => (
                item.role === "user" ? (
                  <UserMessage key={item.id} text={displayContentText(item.content)} />
                ) : (
                  <div key={item.id} className="message-row assistant">
                    <div className="message-bubble assistant">
                      <AssistantContentView itemId={item.id} content={item.content ?? []} projection={toolProjection} />
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SubagentAvatar({ run, compact = false }: { run: SubagentRun; compact?: boolean }) {
  const hue = [...run.id].reduce((value, character) => value + character.charCodeAt(0), 0) % 360;
  return (
    <span className={`subagent-avatar ${compact ? "compact" : ""}`} style={{ "--subagent-hue": hue } as React.CSSProperties}>
      {run.name.trim().slice(0, 1).toUpperCase() || "A"}
    </span>
  );
}

function subagentPreview(run: SubagentRun): string {
  if (run.description?.trim()) return run.description.trim();
  const latest = [...run.history].reverse().find((entry) => entry.role === "assistant" && entry.text.trim());
  return latest?.text.trim().replace(/\s+/g, " ") || (run.status === "running" ? "Working" : "No summary");
}

function subagentStatusLabel(status: SubagentRun["status"]): string {
  if (status === "waiting_approval") return "Waiting for approval";
  return status === "completed" ? "Completed" : toTitleCase(status);
}

function subagentContentText(content: DisplayContentPart[]): string {
  return content.map((part) => {
    if (part.text) return part.text;
    if (part.tool_call) return formatDisplayToolCall(part.tool_call);
    if (part.tool_result) return formatDisplayToolResult(part.tool_result);
    return "";
  }).filter(Boolean).join("\n");
}

function subagentHistory(value: unknown): SubagentHistoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((message) => {
    const record = recordValue(message);
    if (!record || !Array.isArray(record.content)) return [];
    const content = record.content.flatMap(parseSubagentContentPart);
    const text = content.map((part) => {
      if (part.text) return part.text;
      if (part.tool_call) return formatDisplayToolCall(part.tool_call);
      if (part.tool_result) return formatDisplayToolResult(part.tool_result);
      return "";
    }).filter(Boolean).join("\n");
    return content.length > 0 ? [{ role: stringValue(record.role) || "event", text, content }] : [];
  });
}

function parseSubagentContentPart(value: unknown): DisplayContentPart[] {
  const part = recordValue(value);
  if (!part) return [];
  const type = stringValue(part.type);
  if (type === "text" || type === "reasoning") {
    const text = stringValue(part.text);
    return text.trim() ? [{ type, text }] : [];
  }
  const call = recordValue(part.tool_call);
  if (type === "tool_call" && call) {
    return [{
      type,
      tool_call: {
        id: stringValue(call.id),
        name: stringValue(call.name),
        arguments: stringValue(call.arguments),
      },
    }];
  }
  const result = recordValue(part.tool_result);
  if (type === "tool_result" && result) {
    return [{
      type,
      tool_result: {
        tool_call_id: stringValue(result.tool_call_id),
        tool_name: stringValue(result.tool_name),
        result_type: stringValue(result.type),
        text: stringValue(result.text),
        json: result.json,
        reason: stringValue(result.reason),
        content: Array.isArray(result.content) ? result.content.flatMap((value) => {
          const item = recordValue(value);
          return item ? [{ type: stringValue(item.type), text: stringValue(item.text) }] : [];
        }) : undefined,
        is_error: result.is_error === true,
      },
    }];
  }
  return [];
}

function fallbackSubagentHistory(text?: string): SubagentHistoryEntry[] {
  if (!text) return [];
  const trace = text.match(/\n\nTrace:\n([\s\S]*?)(?:\n\nReport:|$)/)?.[1]?.trim();
  const report = text.match(/\n\nReport:\n([\s\S]*)$/)?.[1]?.trim();
  return [
    ...(trace ? [{ role: "tools", text: trace }] : []),
    ...(report ? [{ role: "assistant", text: report }] : []),
  ];
}

function subagentHistoryItems(run: SubagentRun | undefined, workspaceRoot?: string): DisplayItem[] {
  if (!run) return [];
  return run.history.map((entry, index) => ({
    id: `${run.id}-history-${index}`,
    sequence: index + 1,
    type: "assistant_message",
    role: entry.role,
    content: compactSubagentContent(
      entry.content ?? (entry.role === "tools" || entry.role === "tool"
        ? legacyTraceContent(entry.text, run.id)
        : [{ type: "text", text: entry.text }]),
      workspaceRoot,
    ),
    created_at: new Date(0).toISOString(),
  }));
}

function legacyTraceContent(text: string, runID: string): DisplayContentPart[] {
  return text.split("\n").filter(Boolean).map((line, index) => {
    const match = line.match(/^\[[^\]]+\]\s+([^\s(]+)(?:\((.*)\))?$/);
    if (!match) return { type: "text", text: line };
    const rawArguments = match[2] ?? "";
    const argument = rawArguments.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);
    const args = argument ? JSON.stringify({ [argument[1]]: argument[2] }) : rawArguments;
    return {
      type: "tool_call",
      tool_call: { id: `${runID}-legacy-${index}`, name: match[1], arguments: args },
    };
  });
}

function compactSubagentContent(content: DisplayContentPart[], workspaceRoot?: string): DisplayContentPart[] {
  return content.map((part) => ({
    ...part,
    text: compactDisplayPaths(part.text, workspaceRoot),
    tool_call: part.tool_call ? {
      ...part.tool_call,
      arguments: compactDisplayPaths(part.tool_call.arguments, workspaceRoot),
    } : undefined,
    tool_result: part.tool_result ? {
      ...part.tool_result,
      text: compactDisplayPaths(part.tool_result.text, workspaceRoot),
      content: part.tool_result.content?.map((item) => ({ ...item, text: compactDisplayPaths(item.text, workspaceRoot) })),
    } : undefined,
  }));
}

function parseJSONObject(value?: string): Record<string, unknown> | null {
  if (!value) return null;
  try { return recordValue(JSON.parse(value)); } catch { return null; }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
