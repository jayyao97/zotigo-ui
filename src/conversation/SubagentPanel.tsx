import { stateLabel } from "../../shared/i18n/display";
import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import { useLayoutEffect, useMemo, useRef } from "react";
import { SelectionTools, type TranslationOptions } from "./ConversationTools";
import { isNearScrollBottom } from "../app/appHelpers";
import type React from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import { buildToolRenderProjection, groupReasoningItems, hasVisibleAssistantContent, latestPendingToolCall } from "../../shared/sessionDisplay";
import { latestReasoningItemId, type ThinkingDisplayMode } from "../thinkingDisplay";
import type { DisplayContentPart, DisplayItem } from "../../shared/zotigod";
import {
  AssistantContentView,
  compactDisplayPaths,
  displayContentText,
  formatDisplayToolCall,
  formatDisplayToolResult,
  stringValue,
  UserMessage,
  ThinkingDisclosure,
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
  status: "queued" | "interrupted" | "running" | "waiting_approval" | "completed" | "failed";
  history: SubagentHistoryEntry[];
};

export function buildSubagentRuns(items: DisplayItem[]): SubagentRun[] {
  const runs = new Map<string, SubagentRun>();
  const turnRuns = new Set<string>();
  for (const item of items) {
    if (item.type === "turn_completed" || item.type === "turn_failed" || item.type === "turn_interrupted") {
      for (const id of turnRuns) {
        const run = runs.get(id)!;
        if (run.status === "queued" || run.status === "running" || run.status === "waiting_approval") run.status = "interrupted";
      }
      turnRuns.clear();
    }
    const subagent = item.subagent;
    if (subagent?.tool_call_id) {
      const run = runs.get(subagent.tool_call_id) ?? {
        id: subagent.tool_call_id,
        name: subagent.name || "subagent",
        status: "running" as const,
        history: [],
      };
      runs.set(subagent.tool_call_id, run);
      turnRuns.add(run.id);
      if (run.status === "completed" || run.status === "failed" || run.status === "interrupted") continue;
      run.name = subagent.name || run.name;
      run.description = subagent.description || run.description;
      run.workdir = subagent.workdir || run.workdir;
      run.status = subagent.status ?? (run.status === "queued" ? "running" : run.status);
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
        turnRuns.add(call.id);
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
            status: "queued",
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
      run.status = result.is_error || result.result_type === "execution-denied" ? "failed" : "completed";
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
  useLocale();
  const active = runs.filter((run) => run.status === "running" || run.status === "waiting_approval");
  const queued = runs.filter(run => run.status === "queued");
  const done = runs.filter((run) => run.status === "completed" || run.status === "failed" || run.status === "interrupted");
  return (
    <div className="subagent-overview">
      <SubagentSection title={t("subagentPanel.active")} runs={active} empty={queued.length ? undefined : t("subagentPanel.noActive")} onSelect={onSelect} />
      {queued.length > 0 && <SubagentSection title={t("subagentPanel.queued")} runs={queued} onSelect={onSelect} />}
      <SubagentSection title={t("subagentPanel.done")} runs={done} onSelect={onSelect} />
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
  useLocale();
  return (
    <section className="subagent-section">
      <h2>{title} {"·"}{" "}{runs.length}</h2>
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
  thinkingDisplay,
  translation,
}: {
  run?: SubagentRun;
  workspaceRoot?: string;
  onBack: () => void;
  thinkingDisplay?: ThinkingDisplayMode;
  translation?: TranslationOptions;
}) {
  useLocale();
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastTop = useRef(0);
  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport || !content.current) return;
    following.current = true;
    const follow = () => {
      if (!following.current) return;
      viewport.scrollTop = viewport.scrollHeight;
      lastTop.current = viewport.scrollTop;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(content.current);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [run?.id]);
  const compact = (value?: string) => compactDisplayPaths(value, workspaceRoot) ?? "";
  const items = useMemo(() => subagentHistoryItems(run, workspaceRoot), [run, workspaceRoot]);
  const toolProjection = useMemo(() => buildToolRenderProjection(items), [items]);
  const groups = groupReasoningItems(items.filter(item => item.role === "user" || hasVisibleAssistantContent(item, toolProjection)));
  const latestThinking = latestReasoningItemId(items);
  const activeToolCallId = run?.status === "running" ? latestPendingToolCall(items)?.id : undefined;
  const renderItem = (item: DisplayItem) => item.role === "user" ? (
    <UserMessage key={item.id} messageId={item.id} text={displayContentText(item.content)} />
  ) : (
    <div key={item.id} data-message-id={item.id} className="message-row assistant">
      <div className="message-bubble assistant">
        <AssistantContentView itemId={item.id} content={item.content ?? []} projection={toolProjection} activeToolCallId={activeToolCallId} />
      </div>
    </div>
  );
  if (!run) {
    return <div className="subagent-panel-empty">{t("subagentPanel.subagentIsUnavailable")}</div>;
  }
  return (
    <div className="subagent-transcript">
      <header>
        <button type="button" aria-label={t("subagentPanel.backToSubagents")} onClick={onBack}><ArrowLeft size={14} strokeWidth={1.9} /></button>
        <SubagentAvatar run={run} />
        <strong>{run.name}</strong>
        <span className={`subagent-list-status ${run.status}`}>
          {(run.status === "running" || run.status === "waiting_approval") && <LoaderCircle size={12} strokeWidth={1.9} />}
          {subagentStatusLabel(run.status)}
        </span>
      </header>
      {translation && <SelectionTools root={scroll} {...translation} />}
      <div className="subagent-transcript-scroll" ref={scroll} tabIndex={0}
        onWheel={event => { if (event.deltaY < 0 && event.currentTarget.scrollTop > 0) following.current = false; }}
        onScroll={event => {
          const viewport = event.currentTarget;
          if (viewport.scrollTop < lastTop.current) following.current = false;
          else if (viewport.scrollTop > lastTop.current && isNearScrollBottom(viewport)) following.current = true;
          lastTop.current = viewport.scrollTop;
        }}>
        <div className="subagent-transcript-content" ref={content}>
          {run.description && <p className="subagent-transcript-objective">{run.description}</p>}
          {run.workdir && <code className="subagent-transcript-workdir">{compact(run.workdir)}</code>}
          {items.length === 0 ? (
            <div className="subagent-panel-empty">{run.status === "queued" || run.status === "running" || run.status === "waiting_approval" ? subagentStatusLabel(run.status) : t("subagentPanel.noRecordedHistory")}</div>
          ) : (
            <div className="display-log subagent-transcript-history">
              {groups.map(group => group.kind === "reasoning" ? (
                <ThinkingDisclosure key={group.items[0].id} mode={thinkingDisplay} latest={group.items.some(item => item.id === latestThinking)}>
                  {group.items.map(renderItem)}
                </ThinkingDisclosure>
              ) : renderItem(group.item))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SubagentAvatar({ run, compact = false }: { run: SubagentRun; compact?: boolean }) {
  useLocale();
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
  return latest?.text.trim().replace(/\s+/g, " ") || (run.status === "running" ? t("subagentPanel.working") : t("subagentPanel.noSummary"));
}

function subagentStatusLabel(status: SubagentRun["status"]): string {
  if (status === "queued") return t("subagentPanel.queued");
  if (status === "waiting_approval") return t("conversationTimeline.waitingForApproval");
  return status === "completed" ? t("subagentPanel.completed") : stateLabel(status).replace(/^./, character => character.toUpperCase());
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
