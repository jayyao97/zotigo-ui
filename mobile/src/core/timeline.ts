import type {
  DisplayItem,
  SessionDisplayEvent,
  ZotigoSession,
} from "@zotigo/shared/zotigod";
import {
  appendDisplayDelta,
  ephemeralDisplayItems,
  mergeDisplayItems,
  pendingHumanRequestIDs,
  reconcileDisplayPreviews,
  type EphemeralDisplayBlock,
} from "@zotigo/shared/sessionDisplay";
import { ApiError, type DaemonClient } from "./client";
import { EventDecoder } from "./events";
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
  private backfill = false;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private sequence = 0;
  private refreshing = false;
  constructor(
    readonly client: DaemonClient,
    readonly id: string,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<TimelineSnapshot> = {}) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  stop() {
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
        this.client.items(this.id, {}, controller.signal),
        this.client.session(this.id),
      ]);
      if (!alive()) return;
      this.sequence = page.items.at(-1)?.sequence ?? 0;
      this.publish({ items: page.items, session, more: !!page.prev_cursor });
      // Recover the current turn's approvals even when they precede the recent page.
      while (
        this.state.more &&
        !this.state.items.some(
          (i) => i.type === "turn_started" || terminal.has(i.type),
        )
      ) {
        const before = this.state.items[0]?.sequence;
        if (!before) break;
        const older = await this.client.items(
          this.id,
          { before, limit: 100 },
          controller.signal,
        );
        if (!alive()) return;
        if (!older.items.length) break;
        this.publish({
          items: mergeDisplayItems(older.items, this.state.items),
          more: !!older.prev_cursor,
        });
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
              const next = await reader.read();
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
          if (alive()) throw new Error("Connection ended. Reconnecting…");
        } catch (error) {
          if (!alive()) return;
          const fatal =
            error instanceof ApiError &&
            [400, 401, 403, 404, 405].includes(error.status);
          this.publish({
            status: fatal ? "offline" : "reconnecting",
            error:
              error instanceof Error ? error.message : "Connection failed.",
          });
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
              : "Could not load conversation.",
        });
    } finally {
      this.client.signal.removeEventListener("abort", abort);
    }
  }
  accept(event: SessionDisplayEvent) {
    if (event.type === "item") {
      this.sequence = Math.max(this.sequence, event.item.sequence);
      this.previews = reconcileDisplayPreviews(this.previews, event.item);
      this.publish({
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
                  : "Could not refresh runtime.",
            });
        });
    } else {
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
      !this.state.more ||
      !controller ||
      controller.signal.aborted
    )
      return;
    this.backfill = true;
    this.publish({ loadingOlder: true });
    try {
      const page = await this.client.items(
        this.id,
        { before: this.state.items[0]?.sequence, limit: 50 },
        controller.signal,
      );
      if (controller === this.controller && !controller.signal.aborted)
        this.publish({
          items: mergeDisplayItems(page.items, this.state.items),
          more: !!page.prev_cursor,
        });
    } catch (error) {
      if (!controller.signal.aborted)
        this.publish({
          error:
            error instanceof Error ? error.message : "Could not load history.",
        });
    } finally {
      this.backfill = false;
      if (controller === this.controller) this.publish({ loadingOlder: false });
    }
  }
  async refreshSession() {
    if (this.refreshing) return;
    this.refreshing = true;
    const controller = this.controller;
    try {
      const session = await this.client.session(this.id);
      if (
        controller === this.controller &&
        !controller?.signal.aborted &&
        !this.client.signal.aborted
      )
        this.publish({ session });
    } finally {
      this.refreshing = false;
    }
  }
  pending() {
    return pendingHumanRequestIDs(this.state.items);
  }
}
