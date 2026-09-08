import { setTimeout as delay } from "node:timers/promises";
import { initialSessionEventReconnectDelayMs, sessionEventReconnectPlan } from "../shared/sessionEventReconnect";
import type { SessionEventEnvelope } from "../shared/clientTypes";
import { streamSessionEvents, UnsupportedSessionEventsError } from "./zotigod";

type SessionEventStream = typeof streamSessionEvents;

export function createSessionEvents(
  send: (event: SessionEventEnvelope) => void | Promise<void>,
  stream: SessionEventStream = streamSessionEvents,
) {
  let sessionEventsController: AbortController | null = null;
  function startSessionEvents(sessionId: string, after?: number): void {
    stopSessionEvents();
    const controller = new AbortController();
    sessionEventsController = controller;

    void (async () => {
      let cursor = after;
      let reconnecting = false;
      let reconnectDelayMs = initialSessionEventReconnectDelayMs;
      while (!controller.signal.aborted) {
        let connectedAtMs: number | null = null;
        let receivedEvent = false;
        try {
          if (reconnecting) await send({ session_id: sessionId, status: "reconnecting" });
          await stream(
            sessionId,
            cursor,
            async (sessionEvent) => {
              if (sessionEventsController !== controller || controller.signal.aborted) return;
              receivedEvent = true;
              await send({ session_id: sessionId, event: sessionEvent });
              if (sessionEvent.type === "item") {
                cursor = Math.max(cursor ?? 0, sessionEvent.item.sequence);
              }
            },
            () => {
              if (sessionEventsController !== controller || controller.signal.aborted) return;
              connectedAtMs = Date.now();
              return send({ session_id: sessionId, status: "connected" });
            },
            controller.signal,
          );
          reconnecting = true;
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }
          if (error instanceof UnsupportedSessionEventsError) {
            await send({ session_id: sessionId, status: "unsupported" });
            return;
          }
          console.warn("session_stream_reconnect session=%s error_type=%s", sessionId, error instanceof Error ? error.name : typeof error);
          reconnecting = true;
        }
        const reconnectPlan = sessionEventReconnectPlan(reconnectDelayMs, {
          receivedEvent,
          connectedDurationMs: connectedAtMs === null ? 0 : Date.now() - connectedAtMs,
        });
        try {
          await delay(reconnectPlan.delayMs, undefined, { signal: controller.signal });
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        }
        reconnectDelayMs = reconnectPlan.nextDelayMs;
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        controller.abort();
        console.warn(`[zotigo] event subscription stopped: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  function stopSessionEvents(): void {
    sessionEventsController?.abort();
    sessionEventsController = null;
  }


  return { start: startSessionEvents, stop: stopSessionEvents };
}
