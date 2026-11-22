import { t } from "@zotigo/shared/i18n/index";
import { mergeReadState } from "@zotigo/shared/sessionReadState";
import { cachedHistory, cacheHistory } from "./historyCache";
import type {
  DisplayItem,
  SessionDisplayEvent,
  ZotigoSession,
} from "@zotigo/shared/zotigod";
import {
  appendDisplayDelta,
  hasUnresolvedTurnItems,
  ephemeralDisplayItems,
  mergeDisplayItems,
  pendingHumanRequestIDs,
  reconcileDisplayPreviews,
  type EphemeralDisplayBlock,
} from "@zotigo/shared/sessionDisplay";
import { ApiError, type DaemonClient } from "./client";
import { EventDecoder } from "./events";
import { historyBackfillCursor } from "./historyBackfill";
export interface TimelineSnapshot {
  items: DisplayItem[];
  previews: DisplayItem[];
  session: ZotigoSession | null;
  status: "loading" | "connected" | "reconnecting" | "offline";
  error: string;
  more: boolean;
  loadingOlder: boolean;
}
const terminal = new Set(["turn_completed", "turn_failed", "turn_interrupted"]);
export function activeTurn(items: DisplayItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (terminal.has(items[i].type)) return undefined;
    if (["turn_started", "turn_paused"].includes(items[i].type))
      return items[i].turn?.id;
  }
}
/** The daemon sends a heartbeat every 15 s; three missed means the stream is dead. */
export const streamIdleMilliseconds = 45_000;

export class Timeline {
  private state: TimelineSnapshot = {
    items: [],
    previews: [],
    session: null,
    status: "loading",
    error: "",
    more: false,
    loadingOlder: false,
  };
  private listeners = new Set<() => void>();
  private previews: EphemeralDisplayBlock[] = [];
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private backfill?: AbortController;
  private prevCursor: string | null = null;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private sequence = 0;
  private refreshing = false;
  private usageRevision = 0;
  constructor(
    readonly client: DaemonClient,
    readonly id: string,
    /** How long the event stream may stay silent before it is reconnected. */
    private idleLimit = streamIdleMilliseconds,
  ) {
    const cached = cachedHistory(client, id);
    if (cached) {
      this.prevCursor = cached.prevCursor;
      this.state = {
        ...this.state,
        items: cached.items,
        session: cached.session,
        more: !!cached.prevCursor,
      };
    }
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<TimelineSnapshot> = {}) {
    if (patch.session)
      patch.session = {
        ...patch.session,
        read_state: mergeReadState(
          this.state.session?.read_state,
          patch.session.read_state,
        ),
      };
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  stop() {
    cacheHistory(this.client, this.id, {
      items: this.state.items,
      session: this.state.session,
      prevCursor: this.prevCursor,
    });
    this.backfill = undefined;
    this.controller?.abort();
    this.controller = undefined;
    const reader = this.reader;
    this.reader = undefined;
    if (reader) void reader.cancel().catch(() => {});
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.previews = [];
    this.publish({ previews: [], status: "offline", loadingOlder: false });
  }
  async start() {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    const abort = () => controller.abort();
    this.client.signal.addEventListener("abort", abort, { once: true });
    if (this.client.signal.aborted) abort();
    const alive = () =>
      this.controller === controller && !controller.signal.aborted;
    this.publish({ status: "loading", error: "" });
    try {
      const [page, session] = await Promise.all([
        this.client.items(this.id, { limit: 200 }, controller.signal),
        this.client.session(this.id),
      ]);
      if (!alive()) return;
      this.sequence = page.items.at(-1)?.sequence ?? 0;
      const cachedLastSequence = this.state.items.at(-1)?.sequence ?? 0;
      this.prevCursor = historyBackfillCursor(
        this.state.items,
        this.prevCursor,
        page.items,
        page.prev_cursor || null,
      );
      this.publish({
        items: mergeDisplayItems(this.state.items, page.items),
        session,
        more: !!this.prevCursor,
      });
      let recoveredItems = this.state.items;
      let recoveredCursor = this.prevCursor;
      // Recover the current turn's approvals even when they precede the recent page.
      while (
        recoveredCursor &&
        (!recoveredItems.some(
          (i) => i.type === "turn_started" || terminal.has(i.type),
        ) ||
          hasUnresolvedTurnItems(recoveredItems) ||
          (cachedLastSequence > 0 &&
            Number(recoveredCursor) > cachedLastSequence + 1))
      ) {
        const before = Number(recoveredCursor);
        if (!before) break;
        const older = await this.client.items(
          this.id,
          { before, limit: 200 },
          controller.signal,
        );
        if (!alive()) return;
        recoveredCursor =
          older.items.length && older.prev_cursor !== recoveredCursor
            ? older.prev_cursor || null
            : null;
        recoveredItems = mergeDisplayItems(older.items, recoveredItems);
      }
      // Publish recovery as one prepend instead of moving visible rows once per
      // page while the list is still measuring its initial viewport.
      if (recoveredItems !== this.state.items) {
        this.prevCursor = recoveredCursor;
        this.publish({ items: recoveredItems, more: !!recoveredCursor });
      }
      let delay = 500;
      while (alive()) {
        this.previews = [];
        this.publish({ previews: [] });
        try {
          const response = await this.client.stream(
            this.id,
            this.sequence,
            controller.signal,
          );
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            throw new ApiError(
              `Event stream HTTP ${response.status}`,
              response.status,
              "stream_error",
            );
          }
          if (
            !response.headers
              .get("content-type")
              ?.includes("text/event-stream") ||
            !response.body
          ) {
            await response.body?.cancel().catch(() => {});
            throw new Error("Daemon did not return an event stream.");
          }
          if (!alive()) {
            await response.body.cancel().catch(() => {});
            return;
          }
          const parser = new EventDecoder();
          const decoder = new TextDecoder();
          const reader = response.body.getReader();
          this.reader = reader;
          try {
            if (!alive()) return;
            const session = await this.client.session(this.id);
            if (!alive()) return;
            this.publish({ status: "connected", error: "", session });
            while (alive()) {
              // The daemon writes a heartbeat every 15 s, so silence this long
              // means the connection died without closing (say, after moving
              // from Wi-Fi to cellular): give up on it and reconnect.
              let idle: ReturnType<typeof setTimeout> | undefined;
              const next = await Promise.race([
                reader.read(),
                new Promise<{ done: true; value: undefined }>((resolve) => {
                  idle = setTimeout(() => resolve({ done: true, value: undefined }), this.idleLimit);
                }),
              ]).finally(() => clearTimeout(idle));
              if (next.done) break;
              for (const event of parser.push(
                decoder.decode(next.value, { stream: true }),
              )) {
                if (alive()) {
                  this.accept(event);
                  delay = 500;
                }
              }
            }
          } finally {
            if (this.reader === reader) this.reader = undefined;
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          if (alive()) throw new Error("Event stream ended.");
        } catch (error) {
          if (!alive()) return;
          const fatal =
            error instanceof ApiError &&
            [400, 401, 403, 404, 405].includes(error.status);
          // A dropped connection is routine and is retried: it shows as
          // reconnecting, not as an error. Only a refusal stops and reports.
          this.publish(
            fatal
              ? { status: "offline", error: error instanceof Error ? error.message : t("mobile.somethingWentWrong") }
              : { status: "reconnecting", error: "" },
          );
          if (fatal) return;
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", done);
              resolve();
            };
            const timer = setTimeout(done, delay);
            controller.signal.addEventListener("abort", done, { once: true });
          });
          delay = Math.min(delay * 2, 10000);
        }
      }
    } catch (error) {
      if (alive())
        this.publish({
          status: "offline",
          error:
            error instanceof Error
              ? error.message
              : t("mobile.somethingWentWrong"),
        });
    } finally {
      this.client.signal.removeEventListener("abort", abort);
    }
  }
  accept(event: SessionDisplayEvent) {
    if (event.type === "item") {
      const newer = event.item.sequence > this.sequence;
      this.sequence = Math.max(this.sequence, event.item.sequence);
      const updatesUsage = newer && event.item.type === "model_usage_updated" && !!event.item.context_usage && !!this.state.session;
      if (updatesUsage) this.usageRevision++;
      this.previews = reconcileDisplayPreviews(this.previews, event.item);
      this.publish({
        ...(updatesUsage && this.state.session
          ? { session: { ...this.state.session, context_usage: event.item.context_usage } }
          : {}),
        items: mergeDisplayItems(this.state.items, [event.item]),
        previews: ephemeralDisplayItems(this.previews),
      });
      if (
        this.controller &&
        [
          "turn_started",
          "turn_paused",
          "turn_completed",
          "turn_failed",
          "turn_interrupted",
          "approval_decision",
        ].includes(event.item.type)
      )
        void this.refreshSession().catch((error) => {
          if (this.controller && !this.controller.signal.aborted)
            this.publish({
              error:
                error instanceof Error
                  ? error.message
                  : t("mobile.somethingWentWrong"),
            });
        });
    } else if (event.type === "delta") {
      if (this.state.items.some((i) => i.id === event.delta.item_id)) return;
      // Previews are disposable; bound memory when the worker never completes a block.
      this.previews = appendDisplayDelta(
        this.previews,
        event.delta,
        this.state.items,
      )
        .slice(-16)
        .map((b) =>
          b.text.length > 128000 ? { ...b, text: b.text.slice(-128000) } : b,
        );
      if (!this.timer)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.publish({ previews: ephemeralDisplayItems(this.previews) });
        }, 60);
    }
  }
  async older() {
    const controller = this.controller;
    if (
      this.backfill ||
      this.state.status === "loading" ||
      !this.state.more ||
      !controller ||
      controller.signal.aborted
    )
      return;
    this.backfill = controller;
    this.publish({ loadingOlder: true });
    try {
      const page = await this.client.items(
        this.id,
        { before: Number(this.prevCursor), limit: 200 },
        controller.signal,
      );
      if (controller === this.controller && !controller.signal.aborted) {
        this.prevCursor =
          page.items.length && page.prev_cursor !== this.prevCursor
            ? page.prev_cursor || null
            : null;
        this.publish({
          items: mergeDisplayItems(page.items, this.state.items),
          more: !!this.prevCursor,
          error: "",
        });
      }
    } catch (error) {
      if (!controller.signal.aborted)
        this.publish({
          error:
            error instanceof Error ? error.message : t("mobile.somethingWentWrong"),
        });
    } finally {
      if (this.backfill === controller) this.backfill = undefined;
      if (controller === this.controller) this.publish({ loadingOlder: false });
    }
  }
  async setReadState(version: number | null) {
    const state = await this.client.setSessionReadState(this.id, version);
    if (!this.client.signal.aborted && this.state.session)
      this.publish({ session: { ...this.state.session, read_state: state } });
    return state;
  }
  async refreshSession() {
    if (this.refreshing) return;
    this.refreshing = true;
    const controller = this.controller;
    const usageRevision = this.usageRevision;
    try {
      const session = await this.client.session(this.id);
      if (
        controller === this.controller &&
        !controller?.signal.aborted &&
        !this.client.signal.aborted
      )
        this.publish({ session: usageRevision === this.usageRevision
          ? session
          : { ...session, context_usage: this.state.session?.context_usage } });
    } finally {
      this.refreshing = false;
    }
  }
  pending() {
    return pendingHumanRequestIDs(this.state.items);
  }
}
