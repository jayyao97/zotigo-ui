import { setTimeout as delay } from "node:timers/promises";
import { fetchDaemon } from "./daemonHttp";
import { getDaemonConfig } from "./zotigod";
import { readFileEventStream, type FileEvent, type FileEventEnvelope, type WatchedFile } from "../shared/fileEvents";

class FileWatchUnavailable extends Error {}

export async function streamFileEvents(files: WatchedFile[], send: (event: FileEvent) => void | Promise<void>, signal: AbortSignal) {
  const response = await fetchDaemon(`${getDaemonConfig().baseUrl}/files/events`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ files: files.map((file) => ({ ...file, explicitOpen: true })) }), signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    if ([400, 401, 403, 404, 405, 501].includes(response.status)) throw new FileWatchUnavailable();
    throw new Error(`File watch failed (${response.status}).`);
  }
  if (!response.body) throw new Error("Missing file event stream.");
  await readFileEventStream(response.body, send, signal);
}

export function createFileEvents(send: (event: FileEventEnvelope) => void | Promise<void>, stream = streamFileEvents) {
  let controller: AbortController | undefined;
  const stop = () => { controller?.abort(); controller = undefined; };
  function start(subscriptionId: string, files: WatchedFile[]) {
    stop();
    const active = new AbortController(); controller = active;
    const emit = async (event: FileEvent) => {
      if (controller === active && !active.signal.aborted) await send({ ...event, subscriptionId });
    };
    void (async () => {
      let backoff = 500;
      while (!active.signal.aborted) {
        const began = Date.now();
        try { await stream(files, emit, active.signal); }
        catch (error) {
          if (active.signal.aborted) return;
          if (error instanceof FileWatchUnavailable) { await emit({ type: "unavailable", paths: files.map((file) => file.path) }); return; }
        }
        if (active.signal.aborted) return;
        await emit({ type: "reconnecting", paths: [] });
        if (Date.now() - began > 30_000) backoff = 500;
        await delay(backoff, undefined, { signal: active.signal });
        backoff = Math.min(backoff * 2, 30_000);
      }
    })().catch(() => { if (!active.signal.aborted) { void emit({ type: "unavailable", paths: files.map((file) => file.path) }); active.abort(); } });
  }
  return { start, stop };
}
