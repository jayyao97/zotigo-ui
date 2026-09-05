import { once } from "node:events";
import type { ServerResponse } from "node:http";
import type { SessionEventEnvelope } from "../shared/clientTypes";

// Awaiting drain propagates browser backpressure all the way to the daemon
// reader. At most one bounded event is pending for each connection.
export async function writeSessionEvent(response: ServerResponse, event: SessionEventEnvelope, signal: AbortSignal): Promise<void> {
  const id = event.event?.type === "item" ? `id: ${event.event.item.sequence}\n` : "";
  const frame = `${id}data: ${JSON.stringify(event)}\n\n`;
  if (Buffer.byteLength(frame) > 16 * 1024 * 1024) {
    response.destroy();
    throw new Error("Session event exceeds the Web stream limit.");
  }
  if (signal.aborted || response.destroyed) return;
  if (!response.write(frame)) {
    try {
      await once(response, "drain", { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    } catch (error) {
      response.destroy();
      throw error;
    }
  }
}
