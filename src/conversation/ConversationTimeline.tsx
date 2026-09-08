import {
  Children,
  type ReactNode,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Image,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  buildToolRenderProjection,
  contentLocation,
  groupReasoningItems,
  groupTimelineItems,
  hasVisibleAssistantContent,
  latestPendingToolCall,
  orderLateTurnItems,
  pendingHumanRequestIDs,
  sessionAllowsActiveTurn,
  visibleDisplayItems,
  type ToolRenderProjection,
} from "../../shared/sessionDisplay";
import { codexUserText, userImageUrl } from "../../shared/codexUserMessage";
import { approvalPolicyLabel } from "../../shared/approvalPolicy";
import { formatApprovalArguments } from "../../shared/approvalDisplay";
import { buildInteractionAnswers, interactionAnswersComplete, type InteractionDrafts } from "../../shared/interactionAnswers";
import type { ApprovalDecisionInput, CommandImageMetadata, DisplayContentPart, DisplayItem, DisplayToolCall, DisplayToolResult, ZotigoSession } from "../../shared/zotigod";
import type { DaemonSessionBinding } from "../../shared/clientTypes";
import { MarkdownCodeBlock } from "../MarkdownCodeBlock";
import { PreviewImage } from "../ImagePreview";
import { markdownUrlTransform } from "../markdownUrlTransform";
import { defaultThinkingDisclosureOpen, latestReasoningItemId, type ThinkingDisplayMode } from "../thinkingDisplay";
import { initialStreamingTextState, planStreamingTextUpdate } from "../streamingText";

export function formatCompactTokenCount(tokens: number): string {
  if (tokens < 1_000) return tokens.toLocaleString();
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${(tokens / 1_000_000).toFixed(tokens < 10_000_000 ? 1 : 0)}m`;
}

export const SessionTimeline = memo(function SessionTimeline({
  binding,
  session,
  items,
  itemsLoading,
  itemsError,
  message,
  daemonUrl,
  thinkingDisplay,
  streamingItemIds,
  smoothStreaming,
  submittingApprovalIds,
  onSubmitApproval,
  submittingInteractionIds,
  onSubmitInteraction,
}: {
  binding: DaemonSessionBinding | null;
  session: ZotigoSession | null;
  items: DisplayItem[];
  itemsLoading: boolean;
  itemsError: string | null;
  message: string | null;
  daemonUrl: string;
  thinkingDisplay?: ThinkingDisplayMode;
  streamingItemIds: ReadonlySet<string>;
  smoothStreaming: boolean;
  submittingApprovalIds: ReadonlySet<string>;
  onSubmitApproval: (approvalId: string, decisions: ApprovalDecisionInput[]) => Promise<void>;
  submittingInteractionIds: ReadonlySet<string>;
  onSubmitInteraction: (interactionId: string, answers: Record<string, string[]>) => Promise<void>;
}) {
  const compactedItemCacheRef = useRef(new WeakMap<DisplayItem, { workspaceRoot: string; item: DisplayItem }>());
  const displayItems = useMemo(
    () => compactWorkspaceItemPaths(items, session?.working_directory, compactedItemCacheRef.current),
    [items, session?.working_directory],
  );
  const orderedItems = useMemo(() => orderLateTurnItems(displayItems), [displayItems]);
  const visibleItems = useMemo(() => visibleDisplayItems(orderedItems), [orderedItems]);
  const recordedActiveTurn = latestActiveTurn(items);
  const activeTurn = session?.state === "starting" || session?.state === "running" ? recordedActiveTurn : null;
  const openTurn = session && sessionAllowsActiveTurn(session.state) ? recordedActiveTurn : null;
  const pendingRequests = useMemo(() => pendingHumanRequestIDs(items), [items]);
  const pendingApprovalIds = session?.state === "paused" ? pendingRequests.approvals : new Set<string>();
  const pendingInteractionIds = pendingRequests.interactions;
  const activeToolCall = activeTurn
    ? latestPendingToolCall(items, session?.active_tool) ?? latestPendingToolCall(items)
    : null;
  const showThinking = Boolean(activeTurn && !hasDisplayActivityAfter(items, activeTurn.sequence));
  const toolProjection = useMemo(() => buildToolRenderProjection(orderedItems), [orderedItems]);
  const timelineGroups = useMemo(
    () => groupTimelineItems(visibleItems, openTurn?.sequence),
    [visibleItems, openTurn?.sequence],
  );
  const latestThinkingItemId = useMemo(() => latestReasoningItemId(visibleItems), [visibleItems]);

  return (
    <>
      {binding ? (
        <div className="display-log">
          {itemsLoading ? (
            <div className="assistant-note">
              <p>Loading display history...</p>
            </div>
          ) : itemsError ? (
            <div className="assistant-note warning">
              <p>{itemsError}</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="assistant-note">
              <p>No display items returned by zotigod yet.</p>
            </div>
          ) : (
            <>
              {timelineGroups.map((group) => {
                const renderItem = (item: DisplayItem) => (
                  <DisplayTimelineItem
                    key={item.id}
                    item={item}
                    turnEnd={item.type === "turn_started" ? nextTurnTerminal(orderedItems, item.sequence) : null}
                    terminalAt={item.id === recordedActiveTurn?.id && !activeTurn ? session?.ended_at : undefined}
                    turnStopped={item.id === recordedActiveTurn?.id && !activeTurn}
                    turnPaused={item.id === recordedActiveTurn?.id && session?.state === "paused"}
                    daemonUrl={daemonUrl}
                    sessionId={binding.daemon_session_id}
                    toolProjection={toolProjection}
                    approvalPending={Boolean(item.approval?.id && pendingApprovalIds.has(item.approval.id))}
                    approvalSubmitting={item.approval?.id ? submittingApprovalIds.has(item.approval.id) : false}
                    onSubmitApproval={onSubmitApproval}
                    interactionPending={Boolean(item.interaction?.id && pendingInteractionIds.has(item.interaction.id))}
                    interactionSubmitting={item.interaction?.id ? submittingInteractionIds.has(item.interaction.id) : false}
                    onSubmitInteraction={onSubmitInteraction}
                    smoothStreaming={smoothStreaming && streamingItemIds.has(item.id)}
                  />
                );
                if (group.kind === "tools") {
                  return (
                    <HistoricalToolGroup
                      key={`tools-${group.items[0]?.id}`}
                      items={group.items}
                      active={group.active}
                      activeToolCallId={group.active ? activeToolCall?.id : undefined}
                      thinkingDisplay={thinkingDisplay}
                      latestThinkingItemId={latestThinkingItemId}
                      streamingItemIds={streamingItemIds}
                      smoothStreaming={smoothStreaming}
                    />
                  );
                }
                if (group.kind === "reasoning") {
                  return (
                    <ThinkingDisclosure
                      key={`reasoning-${group.items[0]?.id}`}
                      mode={thinkingDisplay}
                      latest={group.items.some((item) => item.id === latestThinkingItemId)}
                    >
                      {group.items.map(renderItem)}
                    </ThinkingDisclosure>
                  );
                }
                return renderItem(group.item);
              })}
              {activeTurn && !activeToolCall && (session?.active_tool || showThinking) && (
                <ThinkingStatus label={session?.active_tool ? `Running ${session.active_tool}` : "Thinking"} />
              )}
            </>
          )}
        </div>
      ) : (
        <div className="assistant-note">
          <p>This conversation is local until a zotigod session is created.</p>
        </div>
      )}

      {session?.error && session.error_code !== "runtime_occupied" && (
        <div className="assistant-note warning">
          <p>{session.error}</p>
        </div>
      )}

      {message && (
        <div className="assistant-note warning">
          <p>{message}</p>
        </div>
      )}
    </>
  );
});

function compactWorkspaceItemPaths(
  items: DisplayItem[],
  workspaceRoot?: string,
  cache?: WeakMap<DisplayItem, { workspaceRoot: string; item: DisplayItem }>,
): DisplayItem[] {
  if (!workspaceRoot) return items;
  const replace = (value?: string) => compactDisplayPaths(value, workspaceRoot);
  return items.map((item) => {
    const cached = cache?.get(item);
    if (cached?.workspaceRoot === workspaceRoot) return cached.item;
    const compacted = {
      ...item,
      content: item.content?.map((part) => ({
        ...part,
        tool_call: part.tool_call ? { ...part.tool_call, arguments: replace(part.tool_call.arguments) } : undefined,
        tool_result: part.tool_result ? {
          ...part.tool_result,
          text: replace(part.tool_result.text),
          content: part.tool_result.content?.map((content) => ({ ...content, text: replace(content.text) })),
        } : undefined,
      })),
      approval: item.approval ? {
        ...item.approval,
        pending: item.approval.pending?.map((pending) => ({
          ...pending,
          arguments: replace(pending.arguments),
        })),
      } : undefined,
    };
    cache?.set(item, { workspaceRoot, item: compacted });
    return compacted;
  });
}

export function compactDisplayPaths(value?: string, workspaceRoot?: string): string | undefined {
  if (!value) return value;
  let compacted = value;
  if (workspaceRoot) {
    compacted = compacted.split(`${workspaceRoot}/`).join("");
    compacted = compacted.split(workspaceRoot).join(".");
  }
  compacted = compacted.split("$WORKSPACE/").join("");
  compacted = compacted.split("$WORKSPACE").join(".");
  const zotigoMarker = "/.zotigo";
  const markerIndex = workspaceRoot?.indexOf(zotigoMarker) ?? -1;
  if (markerIndex >= 0 && workspaceRoot) {
    compacted = compacted.split(workspaceRoot.slice(0, markerIndex + zotigoMarker.length)).join("$ZOTIGO_HOME");
  }
  return compacted;
}

export function latestActiveTurn(items: DisplayItem[]): DisplayItem | null {
  let activeTurn: DisplayItem | null = null;
  for (const item of items) {
    if (item.type === "turn_started") {
      activeTurn = item;
      continue;
    }
    if (activeTurn && isTurnFinal(item)) {
      activeTurn = null;
    }
  }
  return activeTurn;
}

export function latestProfileResult(items: DisplayItem[]): DisplayItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.type === "profile_changed" || item.type === "profile_change_failed") {
      return item;
    }
  }
  return null;
}

function nextTurnTerminal(items: DisplayItem[], sequence: number): DisplayItem | null {
  return items.find((item) => item.sequence > sequence && isTurnFinal(item)) ?? null;
}

function isTurnFinal(item: DisplayItem): boolean {
  return item.type === "turn_completed" || item.type === "turn_failed" || item.type === "turn_interrupted";
}

function hasDisplayActivityAfter(items: DisplayItem[], sequence: number): boolean {
  return items.some(
    (item) =>
      item.sequence > sequence &&
      (item.type === "assistant_message" ||
        item.type === "error" ||
        item.type === "approval_request" ||
        item.type === "approval_decision"),
  );
}

const DisplayTimelineItem = memo(function DisplayTimelineItem({
  item,
  turnEnd,
  terminalAt,
  turnStopped,
  turnPaused,
  daemonUrl,
  sessionId,
  toolProjection,
  approvalPending,
  approvalSubmitting,
  onSubmitApproval,
  interactionPending,
  interactionSubmitting,
  onSubmitInteraction,
  smoothStreaming,
}: {
  item: DisplayItem;
  turnEnd: DisplayItem | null;
  terminalAt?: string;
  turnStopped: boolean;
  turnPaused: boolean;
  daemonUrl: string;
  sessionId?: string;
  toolProjection: ToolRenderProjection;
  approvalPending: boolean;
  approvalSubmitting: boolean;
  onSubmitApproval: (approvalId: string, decisions: ApprovalDecisionInput[]) => Promise<void>;
  interactionPending: boolean;
  interactionSubmitting: boolean;
  onSubmitInteraction: (interactionId: string, answers: Record<string, string[]>) => Promise<void>;
  smoothStreaming: boolean;
}) {
  if (item.type === "profile_changed" || item.type === "profile_change_failed") {
    const target = item.profile?.to ?? "profile";
    const label = item.type === "profile_changed" ? `Profile changed to ${target}` : `Profile change to ${target} failed`;
    return (
      <div className="timeline-divider">
        <span>{item.error ? `${label} · ${item.error}` : label}</span>
      </div>
    );
  }

  if (item.type === "approval_policy_changed") {
    return (
      <div className="timeline-divider">
        <span>Access changed to {approvalPolicyLabel(item.approval_policy?.to ?? null)}</span>
      </div>
    );
  }

  if (item.type === "context_compacted") {
    const compaction = item.context_compaction;
    const label = compaction
      ? `Context compacted · ${formatCompactTokenCount(compaction.original_tokens)} → ${formatCompactTokenCount(compaction.compressed_tokens)}`
      : "Context compacted";
    return (
      <div className="timeline-divider">
        <span>{label}</span>
      </div>
    );
  }

  if (item.type === "error") {
    return <DisplayErrorItem error={item.error} />;
  }

  if (item.type === "approval_request" || item.type === "approval_decision") {
    return (
      <ApprovalItem
        item={item}
        pending={approvalPending}
        submitting={approvalSubmitting}
        onSubmit={onSubmitApproval}
      />
    );
  }

  if (item.type === "interaction_request" || item.type === "interaction_response") {
    return <UserInputItem item={item} pending={interactionPending} submitting={interactionSubmitting} onSubmit={onSubmitInteraction} />;
  }

  if (item.type === "session_command") {
    return (
      <div className="timeline-divider">
        <span>{formatSessionCommand(item)}</span>
      </div>
    );
  }

  if (item.type === "user_message" || item.type === "steering_message") {
    const text = codexUserText(displayContentText(item.content), item);
    const images = displayItemImages(item, daemonUrl, sessionId);
    const skills = item.command?.skills ?? [];
    const hiddenImageCount = Math.max(0, (item.command?.images?.length ?? 0) - images.length);
    const imageSummary = formatImageAttachmentSummary(hiddenImageCount);
    return (
      <UserMessage text={text || (images.length === 0 ? "(No content)" : "")} kicker={item.type === "steering_message" ? "Steering" : undefined} attachments={images.length > 0 ? (
        <div className="message-image-grid" aria-label="Attached images">
          {images.map((image) => <PreviewImage key={image.id} src={image.url} alt={image.name} />)}
        </div>
      ) : undefined}>
        {skills.length > 0 && (
          <div className="message-skills" aria-label="Selected skills">
            {skills.map((skill) => (
              <span key={skill}><Sparkles size={11} strokeWidth={1.8} />{skill}</span>
            ))}
          </div>
        )}
        {imageSummary && (
          <span className="message-image-summary">
            <Image size={14} strokeWidth={1.8} />
            {imageSummary}
          </span>
        )}
      </UserMessage>
    );
  }

  if (item.type.startsWith("turn_")) {
    return <TurnItem item={item} turnEnd={turnEnd} terminalAt={terminalAt} stopped={turnStopped} paused={turnPaused} />;
  }

  if (item.type === "assistant_message") {
    if (!hasVisibleAssistantContent(item, toolProjection)) {
      return null;
    }
    return (
      <div className="message-row assistant">
        <div className="message-bubble assistant">
          <AssistantContentView itemId={item.id} content={item.content ?? []} projection={toolProjection} daemonUrl={daemonUrl} smoothStreaming={smoothStreaming} />
        </div>
      </div>
    );
  }

  return null;
}, (previous, next) => {
  if (
    previous.item !== next.item ||
    previous.turnEnd !== next.turnEnd ||
    previous.terminalAt !== next.terminalAt ||
    previous.turnStopped !== next.turnStopped ||
    previous.turnPaused !== next.turnPaused ||
    previous.daemonUrl !== next.daemonUrl ||
    previous.approvalPending !== next.approvalPending ||
    previous.approvalSubmitting !== next.approvalSubmitting ||
    previous.onSubmitApproval !== next.onSubmitApproval
    || previous.interactionPending !== next.interactionPending
    || previous.interactionSubmitting !== next.interactionSubmitting
    || previous.onSubmitInteraction !== next.onSubmitInteraction
    || previous.smoothStreaming !== next.smoothStreaming
  ) {
    return false;
  }
  if (next.item.type === "assistant_message" && previous.toolProjection !== next.toolProjection) {
    return false;
  }
  return true;
});

function DisplayErrorItem({ error }: { error?: string }) {
  const message = error?.trim() || "Session error";
  return (
    <div className="display-error" role="status">
      <strong>Session error</strong>
      <p>{message}</p>
    </div>
  );
}

function ApprovalItem({
  item,
  pending,
  submitting,
  onSubmit,
}: {
  item: DisplayItem;
  pending: boolean;
  submitting: boolean;
  onSubmit: (approvalId: string, decisions: ApprovalDecisionInput[]) => Promise<void>;
}) {
  const [denyReason, setDenyReason] = useState("");
  const [denying, setDenying] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState<"approve" | "deny" | null>(null);
  const approval = item.approval;
  const pendingItems = approval?.pending ?? [];
  const decisions = approval?.decisions ?? [];
  if (item.type === "approval_decision") {
    const deniedCount = decisions.filter((decision) => !decision.approved).length;
    return deniedCount > 0 ? (
      <div className="tool-process-line approval-denied-line">
        <X size={12} strokeWidth={1.8} />
        <span>{deniedCount === 1 ? "Tool call denied" : `${deniedCount} tool calls denied`}{decisions.find((decision) => !decision.approved)?.reason ? ` · ${decisions.find((decision) => !decision.approved)?.reason}` : ""}</span>
      </div>
    ) : null;
  }
  const heading = pending
    ? "Approval required"
    : "Approval request";
  const decide = async (approved: boolean) => {
    if (!approval?.id || submitting || submittingDecision) return;
    const reason = denyReason.trim();
    const next = pendingItems.map((entry) => ({ tool_call_id: entry.tool_call_id, approved, ...(!approved && reason ? { reason } : {}) }));
    if (next.length === 0) return;
    setSubmittingDecision(approved ? "approve" : "deny");
    try {
      await onSubmit(approval.id, next);
    } finally {
      setSubmittingDecision(null);
    }
  };

  return (
    <div className={`tool-card approval-card ${pending ? "pending" : "resolved"}`}>
      <div className="approval-card-heading">
        {pending ? <ShieldAlert size={15} strokeWidth={1.8} /> : <ShieldCheck size={15} strokeWidth={1.8} />}
        <strong>{heading}</strong>
      </div>
      {item.type === "approval_request" && pendingItems.map((entry, index) => (
        <div className="approval-card-item" key={entry.tool_call_id ?? index}>
          <span>{formatApprovalTool(entry.tool_name, entry.arguments)}</span>
          {entry.description && <p>{entry.description}</p>}
          {entry.reason && <p>{entry.reason}</p>}
          {entry.source && <p className="approval-source">{formatApprovalSource(entry.source)}</p>}
          {entry.arguments && <pre>{formatApprovalArguments(entry.arguments)}</pre>}
        </div>
      ))}
      {pending && pendingItems.length > 0 && (
        <div className="approval-card-actions-wrap">
          {denying && <textarea value={denyReason} onChange={(event) => setDenyReason(event.target.value)} placeholder="Reason for denying (optional)" aria-label="Reason for denying" autoFocus />}
          <div className="approval-card-actions">
            <button type="button" className="secondary" disabled={submitting || submittingDecision !== null} onClick={() => denying ? void decide(false) : setDenying(true)}>
              {submittingDecision === "deny" && <LoaderCircle className="spin" size={14} strokeWidth={2} />}
              {denying ? "Confirm deny" : "Deny"}
            </button>
            <button type="button" className="primary" disabled={submitting || submittingDecision !== null} onClick={() => void decide(true)}>
              {submittingDecision === "approve" ? <LoaderCircle className="spin" size={14} strokeWidth={2} /> : <Check size={14} strokeWidth={2} />}
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatApprovalSource(source: string): string {
  if (source.startsWith("subagent:")) return `Requested by subagent ${source.slice("subagent:".length)}`;
  if (source.startsWith("codex_subagent:")) return "Requested by a Codex subagent";
  return source === "codex" ? "Requested by Codex" : `Requested by ${source}`;
}

function UserInputItem({ item, pending, submitting, onSubmit }: {
  item: DisplayItem;
  pending: boolean;
  submitting: boolean;
  onSubmit: (interactionId: string, answers: Record<string, string[]>) => Promise<void>;
}) {
  const interaction = item.interaction;
  const questions = interaction?.questions ?? [];
  const [answers, setAnswers] = useState<InteractionDrafts>({});
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  if (!interaction) return null;
  if (item.type === "interaction_response") {
    return <div className="tool-process-line"><Check size={12} strokeWidth={1.8} /><span>{interaction.status === "expired" ? "Question expired" : "Answered question"}</span></div>;
  }
  const requester = interaction.requester?.name ? `${interaction.requester.name} asks` : "Input required";
  const complete = interactionAnswersComplete(questions, answers);
  return (
    <form className={`tool-card interaction-card ${pending ? "pending" : "resolved"}`} onSubmit={(event) => {
      event.preventDefault();
      if (!pending || submitting) return;
      if (!complete && !confirmUnanswered) {
        setConfirmUnanswered(true);
        return;
      }
      void onSubmit(interaction.id, buildInteractionAnswers(questions, answers));
    }}>
      <div className="approval-card-heading"><strong>{requester}</strong></div>
      {questions.map((question) => (
        <fieldset key={question.id}>
          <legend>{question.header && <span>{question.header}</span>}{question.question}</legend>
          {(question.options ?? []).map((option) => (
            <label className="interaction-option" key={option.label}>
              <input type="radio" name={question.id} checked={!answers[question.id]?.otherSelected && answers[question.id]?.selected === option.label} onChange={() => { setConfirmUnanswered(false); setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], selected: option.label, otherSelected: false } })); }} />
              <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
            </label>
          ))}
          {question.is_other && (question.options?.length ?? 0) > 0 && (
            <label className="interaction-option">
              <input type="radio" name={question.id} checked={answers[question.id]?.otherSelected === true} onChange={() => { setConfirmUnanswered(false); setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], otherSelected: true } })); }} />
              <span><strong>None of the above</strong></span>
            </label>
          )}
          {((question.options?.length ?? 0) === 0 || answers[question.id]?.selected || answers[question.id]?.otherSelected) && (
            <input type={question.is_secret ? "password" : "text"} value={answers[question.id]?.value ?? ""} onChange={(event) => { setConfirmUnanswered(false); setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], value: event.target.value } })); }} placeholder={(question.options?.length ?? 0) > 0 ? "Add an optional note" : "Type your answer"} aria-label={question.question} autoComplete={question.is_secret ? "new-password" : "off"} data-1p-ignore={question.is_secret ? "true" : undefined} data-lpignore={question.is_secret ? "true" : undefined} />
          )}
        </fieldset>
      ))}
      {pending && confirmUnanswered && <p className="interaction-unanswered-warning">Some questions are unanswered. Submit anyway?</p>}
      {pending && <div className="approval-card-actions">
        {confirmUnanswered && <button type="button" className="secondary" disabled={submitting} onClick={() => setConfirmUnanswered(false)}>Cancel</button>}
        <button type="submit" className="primary" disabled={submitting}>{submitting && <LoaderCircle className="spin" size={14} />}{confirmUnanswered ? "Submit anyway" : "Submit answer"}</button>
      </div>}
    </form>
  );
}

function formatApprovalTool(name?: string, argumentsValue?: string): string {
  const call = { name, arguments: argumentsValue };
  return formatToolCallProcess(call);
}

function formatSessionCommand(item: DisplayItem): string {
  const command = item.command;
  if (!command?.type) {
    return "Session command";
  }
  if (command.type === "message") {
    return "Message queued";
  }
  if (command.type === "pause") {
    return command.reason ? `Pause requested · ${command.reason}` : "Pause requested";
  }
  return `Session command · ${command.type}`;
}

function formatImageAttachmentSummary(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1 ? "1 image attached" : `${count} images attached`;
}

function displayItemImages(
  item: DisplayItem,
  daemonUrl: string,
  sessionId?: string,
): Array<{ id: string; name: string; url: string }> {
  const candidates: Array<{ image: CommandImageMetadata; contentIndex: number }> = [];
  (item.content ?? []).forEach((part, contentIndex) => {
    if (part.image) candidates.push({ image: part.image, contentIndex });
  });
  candidates.push(...(item.command?.images ?? []).map((image) => ({ image, contentIndex: -1 })));

  const seen = new Set<string>();
  const images: Array<{ id: string; name: string; url: string }> = [];
  candidates.forEach(({ image, contentIndex }, index) => {
    const url = userImageUrl(image.url, daemonUrl, sessionId, item.sequence, contentIndex);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    images.push({
      id: `${item.id}-${index}-${url}`,
      name: `Attached image ${index + 1}`,
      url,
    });
  });
  return images;
}

function resolveDaemonImageUrl(daemonUrl: string, imageUrl: string | undefined): string | null {
  if (!imageUrl) {
    return null;
  }
  if (/^https?:\/\//i.test(imageUrl)) {
    if (!daemonUrl) return imageUrl;
  }
  try {
    const url = new URL(imageUrl, daemonUrl);
    const host = new URL(daemonUrl).searchParams.get("zotigoHost");
    if (host && url.origin === new URL(daemonUrl).origin) url.searchParams.set("zotigoHost", host);
    return url.toString();
  } catch {
    return null;
  }
}

function TurnItem({ item, turnEnd, terminalAt, stopped, paused }: { item: DisplayItem; turnEnd: DisplayItem | null; terminalAt?: string; stopped: boolean; paused: boolean }) {
  if (item.type === "turn_started") {
    const endedAt = turnEnd?.created_at ?? terminalAt;
    return (
      <div className="work-divider">
        <span>
          {endedAt
            ? `Worked for ${formatElapsedBetween(item.created_at, endedAt)}`
            : paused
              ? "Waiting for approval"
              : stopped
                ? "Stopped"
                : <ActiveTurnElapsed startedAt={item.created_at} />}
        </span>
      </div>
    );
  }

  const label = item.turn?.status || item.type.replace("turn_", "turn ");
  const detail = item.turn?.last_agent_message || item.turn?.reason || item.turn?.provider_finish_reason;
  return (
    <div className="timeline-divider">
      <span>
        {label}
        {detail ? ` · ${detail}` : ""}
      </span>
    </div>
  );
}

function ActiveTurnElapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <>Working for {formatElapsed(startedAt, now)}</>;
}

function ThinkingStatus({ label = "Thinking" }: { label?: string }) {
  return <div className="thinking-status">{label}</div>;
}

const HistoricalToolGroup = memo(function HistoricalToolGroup({
  items,
  active,
  activeToolCallId,
  thinkingDisplay,
  latestThinkingItemId,
  streamingItemIds,
  smoothStreaming,
}: {
  items: DisplayItem[];
  active: boolean;
  activeToolCallId?: string;
  thinkingDisplay?: ThinkingDisplayMode;
  latestThinkingItemId?: string;
  streamingItemIds: ReadonlySet<string>;
  smoothStreaming: boolean;
}) {
  const toolProjection = useMemo(() => buildToolRenderProjection(items), [items]);
  const renderActivityItem = (item: DisplayItem) => (
    <AssistantContentView
      key={item.id}
      itemId={item.id}
      content={item.content ?? []}
      projection={toolProjection}
      activeToolCallId={activeToolCallId}
      smoothStreaming={smoothStreaming && streamingItemIds.has(item.id)}
    />
  );

  const activityGroups = groupReasoningItems(items);
  const reasoningGroups = activityGroups.filter((group) => group.kind === "reasoning");
  const revealReasoning = thinkingDisplay !== undefined && reasoningGroups.some((group) =>
    defaultThinkingDisclosureOpen(
      thinkingDisplay,
      group.items.some((item) => item.id === latestThinkingItemId),
    ));
  return (
    <TimelineDisclosure className="historical-tool-group" label={historicalToolSummary(items)} active={active || revealReasoning}>
      {activityGroups.map((group) => group.kind === "reasoning"
        ? <ThinkingDisclosure
            key={`reasoning-${group.items[0]?.id}`}
            mode={thinkingDisplay}
            latest={group.items.some((item) => item.id === latestThinkingItemId)}
          >{group.items.map(renderActivityItem)}</ThinkingDisclosure>
        : renderActivityItem(group.item))}
    </TimelineDisclosure>
  );
}, (previous, next) => (
  previous.active === next.active &&
  previous.activeToolCallId === next.activeToolCallId &&
  previous.thinkingDisplay === next.thinkingDisplay &&
  previous.latestThinkingItemId === next.latestThinkingItemId &&
  previous.smoothStreaming === next.smoothStreaming &&
  previous.items.length === next.items.length &&
  previous.items.every((item, index) => item === next.items[index]) &&
  previous.items.every((item) => previous.streamingItemIds.has(item.id) === next.streamingItemIds.has(item.id))
));

function ThinkingDisclosure({ children, mode, latest = false }: { children: ReactNode; mode?: ThinkingDisplayMode; latest?: boolean }) {
  const automaticKey = mode === "latest" ? `${mode}:${latest}` : mode;
  const automaticOpen = mode === undefined ? false : defaultThinkingDisclosureOpen(mode, latest);
  const [manualOpen, setManualOpen] = useState<{ key: string | undefined; open: boolean } | null>(null);
  const open = manualOpen !== null && manualOpen.key === automaticKey ? manualOpen.open : automaticOpen;

  return (
    <TimelineDisclosure
      className="reasoning-group"
      label="Thinking"
      icon={<Sparkles size={12} strokeWidth={1.8} />}
      open={open}
      onOpenChange={(nextOpen) => setManualOpen({ key: automaticKey, open: nextOpen })}
    >
      {children}
    </TimelineDisclosure>
  );
}

function TimelineDisclosure({ className, label, icon, children, active = false, open: controlledOpen, onOpenChange }: { className: string; label: string; icon?: ReactNode; children: ReactNode; active?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(active);
  const open = controlledOpen ?? uncontrolledOpen;

  useEffect(() => {
    if (controlledOpen === undefined) setUncontrolledOpen(active);
  }, [active, controlledOpen]);

  return (
    <div className={`timeline-disclosure ${className} ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => {
          const nextOpen = !open;
          if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
      >
        {icon
          ? <span className="reasoning-icon" aria-hidden="true">{icon}</span>
          : <span className="process-icon" aria-hidden="true"><SquareTerminal size={13} strokeWidth={1.75} /></span>}
        <p>{label}</p>
        <span className="disclosure-chevron" aria-hidden="true"><ChevronRight size={12} strokeWidth={2} /></span>
      </button>
      <DisclosureMotion open={open}>
        <div className="timeline-disclosure-content">{children}</div>
      </DisclosureMotion>
    </div>
  );
}

function DisclosureMotion({ open, className = "", children }: { open: boolean; className?: string; children: ReactNode }) {
  const [present, setPresent] = useState(open);

  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timeout = window.setTimeout(() => setPresent(false), 220);
    return () => window.clearTimeout(timeout);
  }, [open]);

  return (
    <div className={`disclosure-motion ${className}`.trim()} aria-hidden={!open} inert={!open}>
      {present ? children : null}
    </div>
  );
}

function historicalToolSummary(items: DisplayItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const part of item.content ?? []) {
      const name = part.tool_call?.name?.toLowerCase();
      if (!name) continue;
      const category = ["read", "read_file"].includes(name) ? "read"
        : ["grep", "glob", "search"].includes(name) ? "search"
        : ["edit", "write", "write_file", "apply_patch"].includes(name) ? "edit"
        : ["shell", "bash", "exec", "exec_command"].includes(name) ? "command"
        : name === "spawn" ? "subagent"
        : "tool";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  const labels: string[] = [];
  const append = (category: string, singular: string, plural: string) => {
    const count = counts.get(category) ?? 0;
    if (count > 0) labels.push(`${singular} ${count} ${count === 1 ? plural.replace(/s$/, "") : plural}`);
  };
  append("read", "Read", "files");
  append("search", "Searched", "times");
  append("edit", "Edited", "files");
  append("command", "Ran", "commands");
  append("subagent", "Started", "subagents");
  append("tool", "Used", "tools");
  return labels.join(" · ") || "Tool activity";
}

export function AssistantContentView({
  itemId,
  content,
  projection,
  activeToolCallId,
  daemonUrl = "",
  smoothStreaming = false,
}: {
  itemId: string;
  content: DisplayContentPart[];
  projection: ToolRenderProjection;
  activeToolCallId?: string;
  daemonUrl?: string;
  smoothStreaming?: boolean;
}) {
  const consumed = new Set<number>();

  return (
    <>
      {content.map((part, index) => {
        const location = contentLocation(itemId, index);
        if (projection.consumedResults.has(location)) {
          return null;
        }
        if (consumed.has(index)) {
          return null;
        }

        if (part.type === "tool_call") {
          const resultIndex = findToolResultIndex(content, part.tool_call, index + 1);
          const result = projection.resultsByCall.get(location) ??
            (resultIndex === -1 ? undefined : content[resultIndex]?.tool_result);
          if (resultIndex !== -1) {
            consumed.add(resultIndex);
          }
          return (
            <ToolProcess
              key={`${itemId}-${index}`}
              call={part.tool_call}
              result={result}
              progress={part.tool_call?.id ? projection.progressByCall.get(part.tool_call.id) : undefined}
              active={part.tool_call?.id === activeToolCallId}
            />
          );
        }

        return <DisplayContentPartView key={`${itemId}-${index}`} part={part} daemonUrl={daemonUrl} smoothStreaming={smoothStreaming} />;
      })}
    </>
  );
}

function DisplayContentPartView({ part, daemonUrl, smoothStreaming }: { part: DisplayContentPart; daemonUrl: string; smoothStreaming: boolean }) {
  if (part.type === "text") {
    return part.text ? <MarkdownContent text={part.text} smoothStreaming={smoothStreaming} /> : null;
  }

  if (part.type === "reasoning") {
    return part.text ? (
      <div className="reasoning-block markdown-copy">
        <SmoothStreamingMarkdownBody text={part.text} streaming={smoothStreaming} />
      </div>
    ) : <ThinkingStatus />;
  }

  if (part.type === "image") {
    const url = resolveDaemonImageUrl(daemonUrl, part.image?.url);
    return url ? (
      <figure className="assistant-image">
        <PreviewImage
          src={url}
          alt="Generated image"
          width={part.image?.width}
          height={part.image?.height}
        />
      </figure>
    ) : null;
  }

  if (part.type === "tool_call") {
    return <ToolProcess call={part.tool_call} />;
  }

  if (part.type === "tool_result") {
    const isError = isToolResultError(part.tool_result);
    const summary = formatToolResultSummary(part.tool_result);
    return (
      <ToolDisclosure
        summary={summary}
        detail={formatFullToolResult(part.tool_result)}
        title={summary}
        isError={isError}
      />
    );
  }

  return part.text ? <MarkdownContent text={part.text} /> : null;
}

function ToolProcess({ call, result, progress, active = false }: { call: DisplayToolCall | undefined; result?: DisplayToolResult; progress?: string; active?: boolean }) {
  const running = !result && (active || Boolean(progress));
  const summary = running ? formatRunningToolCall(call) : formatToolCallProcess(call);
  const isFailure = isToolResultFailure(result);
  const detail = result ? formatFullToolResult(result) : progress ?? "";
  const language = toolResultLanguage(call);
  const expandableRunningShell = running && language === "Shell";

  if ((!detail && !expandableRunningShell) || shouldSuppressToolResult(call, result)) {
    return <ToolProcessLine summary={summary} isError={isFailure} running={running} />;
  }

  return (
    <ToolDisclosure
      summary={summary}
      detail={detail || "Waiting for output…"}
      language={language}
      title={toolDetailTitle(call, language, summary)}
      showStatus={language === "Shell" || isFailure}
      isError={isFailure}
      running={running}
    />
  );
}

function ToolProcessLine({ summary, isError = false, running = false }: { summary: string; isError?: boolean; running?: boolean }) {
  return (
    <div className={`tool-process-line ${isError ? "error" : ""} ${running ? "running" : ""}`}>
      <span className="process-icon" aria-hidden="true"><SquareTerminal size={13} strokeWidth={1.75} /></span>
      <p>{summary}</p>
    </div>
  );
}

function MarkdownContent({ text, smoothStreaming = false }: { text: string; smoothStreaming?: boolean }) {
  return (
    <div className="assistant-copy markdown-copy">
      <SmoothStreamingMarkdownBody text={text} streaming={smoothStreaming} />
    </div>
  );
}

const userMessageCollapsedLines = 20;

export function UserMessage({ text, kicker, children, attachments }: { text: string; kicker?: string; children?: ReactNode; attachments?: ReactNode }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [collapsible, setCollapsible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const collapsed = collapsible && !expanded;
  const hasBubble = Boolean(text || kicker || Children.toArray(children).length);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
      if (!Number.isFinite(lineHeight)) return;
      setCollapsible(element.scrollHeight > lineHeight * userMessageCollapsedLines + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="message-row user">
      <div className="user-message-stack">
        {attachments}
        {hasBubble && <div className="message-bubble user">
          {kicker && <span className="message-kicker">{kicker}</span>}
          {text && (
            <div
              ref={contentRef}
              className={`user-message-content markdown-copy ${collapsed ? "collapsed" : ""}`}
            >
              <MarkdownBody text={text} />
            </div>
          )}
          {collapsed && <span className="user-message-ellipsis" aria-hidden="true">…</span>}
          {children}
        </div>}
        {collapsible && (
          <button
            type="button"
            className="user-message-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Show more"}
            <ChevronDown size={12} strokeWidth={2} className={expanded ? "expanded" : ""} />
          </button>
        )}
      </div>
    </div>
  );
}

const MarkdownBody = memo(function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{ pre: MarkdownCodeBlock }}
      remarkPlugins={[remarkGfm]}
      urlTransform={markdownUrlTransform}
    >
      {text}
    </ReactMarkdown>
  );
});

function SmoothStreamingMarkdownBody({ text, streaming }: { text: string; streaming: boolean }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [state, setState] = useState(() => initialStreamingTextState(text, streaming, reduceMotion));

  useLayoutEffect(() => {
    const update = planStreamingTextUpdate(state, text, streaming, reduceMotion);
    if (update.state === state) return;
    if (!update.onAnimationFrame) {
      setState(update.state);
      return;
    }
    const frame = window.requestAnimationFrame(() => setState(update.state));
    return () => window.cancelAnimationFrame(frame);
  }, [reduceMotion, state, streaming, text]);

  return <MarkdownBody text={state.visibleText} />;
}

function ToolDisclosure({
  summary,
  detail,
  language = "plaintext",
  title,
  showStatus = false,
  isError = false,
  running = false,
}: {
  summary: string;
  detail: string;
  language?: string;
  title: string;
  showStatus?: boolean;
  isError?: boolean;
  running?: boolean;
}) {
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const wasRunningRef = useRef(running);

  useEffect(() => {
    if (!running && wasRunningRef.current) {
      setOpen(false);
    }
    wasRunningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const detailElement = detailRef.current;
      if (detailElement) {
        detailElement.scrollTop = detailElement.scrollHeight;
      }
    });
  }, [detail, open]);

  return (
    <div className={`tool-disclosure ${isError ? "error" : ""} ${running ? "running" : ""} ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="process-icon" aria-hidden="true"><SquareTerminal size={13} strokeWidth={1.75} /></span>
        <p>{summary}</p>
        <span className="disclosure-chevron" aria-hidden="true">
          <ChevronRight size={12} strokeWidth={2} />
        </span>
      </button>
      <DisclosureMotion open={open} className="tool-detail-motion">
        <div className="tool-detail-card">
          <div className="tool-detail-header">
            <div>
              <span className="tool-detail-language">{language}</span>
              <p className="tool-detail-title">{title}</p>
            </div>
            <button
              type="button"
              className="tool-copy-button"
              aria-label="Copy tool result"
              title="Copy result"
              onClick={() => void navigator.clipboard.writeText(detail)}
            >
              <Copy size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <div className="tool-detail-body" ref={detailRef}>
            <pre>{detail}</pre>
          </div>
          {showStatus && (
            <div className={`tool-detail-status ${isError ? "failed" : running ? "running" : ""}`}>
              <span aria-hidden="true">{isError ? "×" : running ? "•" : "✓"}</span>
              {isError ? "Failed" : running ? "Running" : "Success"}
            </div>
          )}
        </div>
      </DisclosureMotion>
    </div>
  );
}

export function displayContentText(content: DisplayContentPart[] | undefined): string {
  const text = (content ?? [])
    .map((part) => {
      if (part.type === "tool_call") {
        return formatDisplayToolCall(part.tool_call);
      }
      if (part.type === "tool_result") {
        return formatDisplayToolResult(part.tool_result);
      }
      return part.text ?? "";
    })
    .filter(Boolean)
    .join("\n");
  return text;
}

function formatElapsed(startedAt: string, now: number): string {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return "0s";
  }
  return formatDurationSeconds(Math.max(0, Math.floor((now - started) / 1000)));
}

function formatElapsedBetween(startedAt: string, endedAt: string): string {
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) {
    return "0s";
  }
  return formatDurationSeconds(Math.max(0, Math.floor((ended - started) / 1000)));
}

function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function findToolResultIndex(content: DisplayContentPart[], call: DisplayToolCall | undefined, startIndex: number): number {
  if (call?.id) {
    const exactIndex = content.findIndex(
      (part) => part.type === "tool_result" && part.tool_result?.tool_call_id === call.id,
    );
    if (exactIndex !== -1) {
      return exactIndex;
    }
  }

  for (let index = startIndex; index < content.length; index += 1) {
    const part = content[index];
    if (part.type !== "tool_result") {
      continue;
    }

    const result = part.tool_result;
    if (call?.name && result?.tool_name) {
      if (call.name === result.tool_name) {
        return index;
      }
      continue;
    }
    return index;
  }

  return -1;
}

function shouldSuppressToolResult(call: DisplayToolCall | undefined, result: DisplayToolResult | undefined): boolean {
  if (!call?.name || !result || isToolResultError(result)) {
    return false;
  }

  return ["read", "read_file"].includes(call.name);
}

function toolResultLanguage(call: DisplayToolCall | undefined): string {
  const name = call?.name?.toLowerCase() ?? "";
  if (name.includes("command") || name.includes("shell") || name === "bash" || name === "exec") {
    return "Shell";
  }
  return "plaintext";
}

function toolResultCommand(call: DisplayToolCall | undefined, language: string): string {
  if (language !== "Shell" || !call?.arguments) {
    return "";
  }
  const parsed = parseToolArguments(call.arguments);
  if (!parsed) {
    return call.arguments.trim();
  }
  return (
    stringValue(parsed.command) ||
    stringValue(parsed.cmd) ||
    stringValue(parsed.script) ||
    stringValue(parsed.input) ||
    call.arguments.trim()
  );
}

function toolDetailTitle(call: DisplayToolCall | undefined, language: string, summary: string): string {
  const command = toolResultCommand(call, language);
  return command ? `$ ${command}` : summary;
}

function formatToolCallProcess(call: DisplayToolCall | undefined): string {
  if (!call?.name) {
    return "Called a tool";
  }
  const action = humanizeToolName(call.name);
  const target = call.arguments ? formatToolTarget(call.name, call.arguments) : "";
  return target ? `${action} ${target}` : action;
}

function formatRunningToolCall(call: DisplayToolCall | undefined): string {
  if (!call?.name) return "Running tool";
  const target = call.arguments ? formatToolTarget(call.name, call.arguments) : "";
  return target ? `Running ${call.name} · ${target}` : `Running ${call.name}`;
}

function formatToolResultSummary(result: DisplayToolResult | undefined): string {
  if (!result) {
    return "Tool finished";
  }
  if (isToolResultError(result)) {
    return "Tool failed";
  }
  const output = formatDisplayToolResult(result);
  return !output || output === "(No output)" ? "Tool finished" : "Tool returned output";
}

function formatFullToolResult(result: DisplayToolResult | undefined): string {
  if (!result) {
    return "(No output)";
  }

  if (result.result_type === "execution-denied") {
    return `Denied: ${result.reason?.trim() || "permission denied"}`;
  }

  const contentText = (result.content ?? [])
    .map((part) => part.text || (part.image ? `[image ${part.image.media_type || part.image.url || part.image.file_id || ""}]` : ""))
    .filter(Boolean)
    .join("\n");
  const text = result.text || jsonText(result.json) || contentText;
  if (isToolResultError(result)) {
    return `Error: ${text || "tool failed"}`;
  }
  return text || "(No output)";
}

export function formatDisplayToolCall(call: DisplayToolCall | undefined): string {
  if (!call) {
    return "Tool call";
  }

  const name = toTitleCase(call.name || "tool");
  const args = call.arguments ? primaryToolArgument(call.arguments) : "";
  return args ? `${name}(${args})` : `${name}()`;
}

export function formatDisplayToolResult(result: DisplayToolResult | undefined): string {
  if (!result) {
    return "(No output)";
  }

  if (result.result_type === "execution-denied") {
    return `Denied: ${result.reason?.trim() || "permission denied"}`;
  }

  if (isToolResultError(result)) {
    return `Error: ${truncate(result.text || jsonText(result.json), 200) || "tool failed"}`;
  }

  const contentText = (result.content ?? [])
    .map((part) => part.text || (part.image ? `[image ${part.image.media_type || part.image.url || part.image.file_id || ""}]` : ""))
    .filter(Boolean)
    .join("\n");
  const text = result.text || jsonText(result.json) || contentText;
  return truncate(text || "(No output)", 300);
}

function isToolResultError(result: DisplayToolResult | undefined): boolean {
  return Boolean(
    result &&
      (result.is_error ||
        result.result_type === "execution-denied" ||
        result.result_type === "error-text" ||
        result.result_type === "error-json"),
  );
}

function isToolResultFailure(result: DisplayToolResult | undefined): boolean {
  const exitCode = toolResultExitCode(result);
  if (exitCode !== undefined) {
    return exitCode !== 0;
  }
  return isToolResultError(result);
}

function toolResultExitCode(result: DisplayToolResult | undefined): number | undefined {
  if (typeof result?.exit_code === "number") {
    return result.exit_code;
  }
  if (!result?.json || typeof result.json !== "object" || Array.isArray(result.json)) {
    return undefined;
  }
  const record = result.json as Record<string, unknown>;
  const exitCode = record.exit_code ?? record.exitCode;
  return typeof exitCode === "number" ? exitCode : undefined;
}

function primaryToolArgument(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return truncate(raw, 80);
    }
    const record = parsed as Record<string, unknown>;
    for (const key of ["command", "path", "query", "pattern", "name"]) {
      if (record[key] !== undefined) {
        return truncate(String(record[key]), 80);
      }
    }
    const firstKey = Object.keys(record)[0];
    return firstKey ? `${firstKey}=${truncate(String(record[firstKey]), 80)}` : "";
  } catch {
    return truncate(raw, 80);
  }
}

function formatToolTarget(name: string, raw: string): string {
  const parsed = parseToolArguments(raw);
  if (!parsed) {
    return primaryToolArgument(raw);
  }

  if (name === "glob") {
    const pattern = stringValue(parsed.pattern);
    const path = stringValue(parsed.path);
    if (pattern && path) {
      return `${pattern} in ${truncate(path, 72)}`;
    }
  }

  return primaryToolArgument(raw);
}

function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function jsonText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join("\n");
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function humanizeToolName(value: string): string {
  const words = value
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return "Called a tool";
  }

  const first = words[0].toLowerCase();
  const rest = words.slice(1).join(" ");
  const verb =
    first === "read" || first === "open" || first === "search" || first === "list" || first === "run"
      ? `${first[0].toUpperCase()}${first.slice(1)}`
      : `Ran ${first}`;
  return rest ? `${verb} ${rest}` : verb;
}

export function toTitleCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}
