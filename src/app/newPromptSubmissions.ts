import { useSyncExternalStore } from "react";
import type { FirstMessageInput } from "../../shared/clientTypes";
import type { DisplayItem } from "../../shared/zotigod";
import type { ComposerDraft } from "./appTypes";

/**
 * A new session's first message. It is kept per host, outside the App that
 * submitted it, so a host switch cannot drop it and a later App for the same
 * host can still show, retry or restore it.
 */
export type NewPromptSubmission = {
  /** Client message id. The daemon gives the accepted user_message the same id. */
  id: string;
  /** Composer that shows the preview and receives a restored draft. */
  draftKey: string;
  /** The created session; delivery and reconciliation use it, never the visible selection. */
  sessionId?: string;
  item: DisplayItem;
  /** Submitted composer draft, kept until delivery is confirmed. */
  draft: ComposerDraft | null;
  /** First message as handed to the backend; a retry resends it with the same client message id. */
  message?: FirstMessageInput & { conversationId: string };
  /**
   * An earlier attempt ended without a confirmed outcome, so the daemon may hold the
   * message. A later refusal or blocked retry cannot prove it missing; only its
   * user_message settles it.
   */
  mayHaveArrived?: true;
};

const submissionsByHost = new Map<string, readonly NewPromptSubmission[]>();
const listeners = new Set<() => void>();
const none: readonly NewPromptSubmission[] = [];

function publish(scope: string, next: readonly NewPromptSubmission[]) {
  if (next.length) submissionsByHost.set(scope, next);
  else submissionsByHost.delete(scope);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useNewPromptSubmissions(scope: string): readonly NewPromptSubmission[] {
  return useSyncExternalStore(subscribe, () => submissionsByHost.get(scope) ?? none);
}

export function newPromptSubmission(scope: string, id: string): NewPromptSubmission | undefined {
  return submissionsByHost.get(scope)?.find((submission) => submission.id === id);
}

export function putNewPromptSubmission(scope: string, submission: NewPromptSubmission): void {
  const current = submissionsByHost.get(scope) ?? none;
  publish(scope, [...current.filter((value) => value.id !== submission.id), submission]);
}

/** Updates a submission; returning null removes it and releases its draft attachments. */
export function updateNewPromptSubmission(scope: string, id: string, update: (submission: NewPromptSubmission) => NewPromptSubmission | null): void {
  const current = submissionsByHost.get(scope) ?? none;
  const existing = current.find((value) => value.id === id);
  if (!existing) return;
  const next = update(existing);
  if (next?.draft !== existing.draft && existing.draft) releaseDraft(existing.draft, next?.draft);
  publish(scope, next ? current.map((value) => value.id === id ? next : value) : current.filter((value) => value.id !== id));
}

/** Removes a submission and hands its draft, attachments included, to the caller. */
export function takeNewPromptSubmission(scope: string, id: string): NewPromptSubmission | undefined {
  const current = submissionsByHost.get(scope) ?? none;
  const existing = current.find((value) => value.id === id);
  if (existing) publish(scope, current.filter((value) => value.id !== id));
  return existing;
}

export function discardNewPromptSubmissions(scope?: string): void {
  for (const [host, submissions] of [...submissionsByHost.entries()]) {
    if (scope !== undefined && host !== scope) continue;
    for (const submission of submissions) if (submission.draft) releaseDraft(submission.draft);
    publish(host, none);
  }
}

function releaseDraft(draft: ComposerDraft, kept?: ComposerDraft | null) {
  const keptUrls = new Set(kept?.attachments.map((attachment) => attachment.url));
  for (const attachment of draft.attachments) if (attachment.url && !keptUrls.has(attachment.url)) URL.revokeObjectURL(attachment.url);
}
