import { t } from "@zotigo/shared/i18n/index";
import {
  acknowledgeOptimisticPrompt,
  capturePromptTimelineAnchor,
  optimisticPromptDisplayItem,
  type PromptTimelineAnchor,
} from "@zotigo/shared/sessionDisplay";
import { inputDeliveryOutcome } from "@zotigo/shared/inputDelivery";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { errorText } from "../../components/ui";
import { ApiError, type DaemonClient } from "../../core/client";
import {
  ComposerStore,
  emptyDraft,
  failedSendState,
  prepareAttachments,
  submissionAttempt,
  type ComposerState,
  type Draft,
} from "../../core/composer";
import type { ConversationReference } from "../../core/conversationReferences";
import { activeTurn, type Timeline } from "../../core/timeline";
import { finishInBackground } from "../../platform/backgroundTask";
import { pickAttachments } from "../../platform/pickAttachments";
import { pickImages } from "../../platform/pickImages";
import { storage } from "../../platform/storage";

/**
 * The conversation's draft and its submission. One owner for persistence: the
 * exact payload and client message ID are stored before dispatch so an
 * uncertain result retries the same request, and no cleanup can write an older
 * snapshot after a send. Also owns the optimistic prompt shown while sending.
 */
export function useComposerDraft({
  client,
  id,
  timeline,
  items,
  alive,
  lock,
  onError,
}: {
  client: DaemonClient;
  id: string;
  timeline: Timeline;
  /** Durable timeline items; an optimistic prompt leaves once its durable copy arrives. */
  items: DisplayItem[];
  alive: RefObject<boolean>;
  /** The screen's single-flight mutation lock. */
  lock: RefObject<boolean>;
  onError: (message: string) => void;
}) {
  const composer = useMemo(
    () => new ComposerStore(storage, client.connection.id, id),
    [client, id],
  );
  const [saved, setSaved] = useState<ComposerState>({ draft: emptyDraft() });
  const draftRef = useRef(saved);
  const [promptPreviews, setPromptPreviews] = useState<DisplayItem[]>([]);
  const promptAnchors = useRef(new Map<string, PromptTimelineAnchor>());
  const [loaded, setLoaded] = useState(false);
  // Edits before the saved draft is read would replace it, including a pending
  // retry and its message ID, so they are ignored until then.
  const loadedRef = useRef(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const revision = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    // A new store (new credentials for the same device) reads its own draft;
    // edits wait for it like on first load.
    loadedRef.current = false;
    setLoaded(false);
    composer
      .read()
      .then((value) => {
        if (active) {
          draftRef.current = value;
          loadedRef.current = true;
          setSaved(value);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) onError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [composer]);
  // One persistence owner: no effect cleanup can enqueue an older snapshot after send.
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (revision.current) void composer.write(draftRef.current).catch(() => {});
    },
    [composer],
  );
  useEffect(() => {
    const durable = new Set(items.map((item) => item.id));
    setPromptPreviews((previews) =>
      previews.some((item) => durable.has(item.id))
        ? previews.filter((item) => !durable.has(item.id))
        : previews,
    );
    for (const id of durable) promptAnchors.current.delete(id);
    // The daemon gives the accepted message the client message ID: once it is
    // in the conversation, an uncertain attempt is settled and the composer
    // is free again. Never while a send is still running.
    const attempt = draftRef.current.attempt;
    if (loadedRef.current && attempt && durable.has(attempt.client_message_id) && !composer.sending()) {
      const settled = { draft: emptyDraft() };
      void composer.transition(draftRef, settled).catch(() => {});
      setSaved(settled);
    }
  }, [items, composer, loaded]);
  const update = useCallback(
    (patch: Partial<Draft>) => {
      if (!loadedRef.current) return;
      const next = {
        ...draftRef.current,
        draft: { ...draftRef.current.draft, ...patch },
      };
      revision.current++;
      draftRef.current = next;
      setSaved(next);
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = undefined;
        void composer.write(draftRef.current).catch((e) => {
          if (alive.current) onError(t("mobile.draftSaveFailed", { error: errorText(e) }));
        });
      }, 300);
    },
    [composer],
  );
  const addReference = useCallback(
    (reference: Omit<ConversationReference, "id">) => {
      if (lock.current || draftRef.current.attempt) return;
      update({
        references: [
          ...(draftRef.current.draft.references ?? []),
          { ...reference, id: randomUUID() },
        ],
      });
    },
    [update],
  );
  async function sendRequest(mode: "queue" | "steering") {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    const promptId = draftRef.current.attempt?.client_message_id ?? randomUUID();
    const initial = draftRef.current;
    const preview = optimisticPromptDisplayItem({
      id: promptId,
      text:
        initial.attempt?.text ??
        [initial.draft.text, ...(initial.draft.files ?? []).map((file) => file.name)]
          .filter(Boolean)
          .join("\n\n"),
      skills: initial.draft.skills,
      steering:
        initial.attempt?.steer ??
        (mode === "steering" && !!activeTurn(timeline.snapshot().items)),
      createdAt: new Date().toISOString(),
      images: initial.draft.images.map((image) => ({
        url: `data:${image.mime_type};base64,${image.data_base64}`,
      })),
    });
    preview.queuedPreview = initial.attempt ? initial.attempt.mode === "queue" : mode === "queue";
    if (!preview.queuedPreview && !promptAnchors.current.has(promptId)) {
      const snapshot = timeline.snapshot();
      promptAnchors.current.set(
        promptId,
        capturePromptTimelineAnchor(
          snapshot.items.at(-1)?.sequence ?? 0,
          snapshot.previews.map((item) => item.id),
          promptAnchors.current,
        ),
      );
    }
    if (alive.current)
      setPromptPreviews((previews) => [...previews.filter((item) => item.id !== promptId), preview]);
    let prepared = false;
    try {
      await prepareAttachments(client, id, draftRef, composer, (value) => {
        if (alive.current) setSaved(value);
      });
      const current = draftRef.current;
      const retry = !!current.attempt;
      const attempt = submissionAttempt(
        current,
        promptId,
        mode === "steering" && !!activeTurn(timeline.snapshot().items),
        mode === "queue" ? "queue" : undefined,
      );

      const pending = { draft: current.draft, attempt };
      draftRef.current = pending;
      if (alive.current) setSaved(pending);
      revision.current++;
      await composer.write(pending); // Persist exact payload/id before dispatch so a timeout is retryable.
      prepared = true;
      let command;
      try {
        command = await client.send(
          id,
          {
            text: attempt.text,
            skills: attempt.skills,
            images: attempt.images,
            client_message_id: attempt.client_message_id,
          },
          attempt.mode ?? attempt.steer,
        );
      } catch (e) {
        const next = failedSendState(
          current.draft,
          attempt,
          e instanceof ApiError ? inputDeliveryOutcome(e.status, e.code) : "unknown",
          retry,
        );
        if (next.attempt) {
          if (alive.current)
            setPromptPreviews((previews) =>
              previews.map((item) =>
                item.id === promptId
                  ? { ...item, delivery: { state: "failed", error: t("mobile.deliveryUnknown") } }
                  : item,
              ),
            );
        } else {
          if (alive.current)
            setPromptPreviews((previews) => previews.filter((item) => item.id !== promptId));
          promptAnchors.current.delete(promptId);
        }
        const persisted = composer.transition(draftRef, next);
        if (alive.current) setSaved(next);
        // The send error is what the user needs; a save failure is reported apart.
        await persisted.catch((saveError) => {
          if (alive.current) onError(t("mobile.draftSaveFailed", { error: errorText(saveError) }));
        });
        if (attempt.mode === "queue" && e instanceof ApiError && [404, 405].includes(e.status))
          throw new Error(
            t("mobile.thisDaemonDoesNotSupportQueuedMessagesYetUpdateTheDaemonOrSwitchToSteer"),
          );
        throw e;
      }
      // Accepted. What follows is local bookkeeping: if it fails, the message
      // is still delivered and must not be reported as uncertain.
      if (alive.current) {
        const acknowledged = acknowledgeOptimisticPrompt(
          preview,
          command,
          timeline.snapshot().items,
        );
        const anchor = promptAnchors.current.get(promptId);
        promptAnchors.current.delete(promptId);
        if (anchor && acknowledged) promptAnchors.current.set(command.id, anchor);
        setPromptPreviews((previews) => [
          ...previews.filter((item) => item.id !== promptId),
          ...(acknowledged
            ? [
                {
                  ...acknowledged,
                  queuedPreview: preview.queuedPreview,
                  queueConfirmed: preview.queuedPreview,
                },
              ]
            : []),
        ]);
        setQueueRevision((value) => value + 1);
      }
      const empty = { draft: emptyDraft() };
      const persisted = composer.transition(draftRef, empty);
      if (alive.current) setSaved(empty);
      await persisted.catch((e) => {
        if (alive.current) onError(t("mobile.draftSaveFailed", { error: errorText(e) }));
      });
    } catch (e) {
      if (!prepared && alive.current)
        setPromptPreviews((previews) => previews.filter((item) => item.id !== promptId));
      throw e;
    }
  }
  async function attachImages(source: "library" | "camera") {
    const { images, files } = draftRef.current.draft;
    const picked = await pickImages(source, images, files ?? []);
    if (picked && alive.current) update({ images: picked });
  }
  async function attachFiles() {
    const picked = await pickAttachments(
      draftRef.current.draft.images,
      draftRef.current.draft.files ?? [],
    );
    if (picked && alive.current) update(picked);
  }
  return {
    loaded,
    saved,
    update,
    addReference,
    /** Send the current draft, or retry the persisted attempt. Single-flight per session. */
    // Leaving the app right after Send must not cut the request off.
    submit: (mode: "queue" | "steering") =>
      composer.submit(() => finishInBackground("send-message", () => sendRequest(mode))),
    attachImages,
    attachFiles,
    promptPreviews,
    promptAnchors,
    dropPromptPreviews: (ids: string[]) =>
      setPromptPreviews((previews) => previews.filter((item) => !ids.includes(item.id))),
    queueRevision,
  };
}
