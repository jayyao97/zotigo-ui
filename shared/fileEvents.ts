export interface WatchedFile { path: string; sessionId?: string }
export interface FileEvent {
  type: "ready" | "changed" | "reconnecting" | "unavailable";
  // ready lists paths that could not be watched; changed lists invalidations.
  paths: string[];
}
export interface FileEventEnvelope extends FileEvent { subscriptionId: string }

/** The daemon and Web gateway emit bounded, single-line JSON SSE frames. */
export async function readFileEventStream<T extends FileEvent>(body: ReadableStream<Uint8Array>, send: (event: T) => void | Promise<void>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) return;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new Error("File event exceeds limit.");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const event = JSON.parse(data) as T;
        if (!["ready", "changed", "reconnecting", "unavailable"].includes(event.type) || !Array.isArray(event.paths) || event.paths.length > 64 || event.paths.some((path) => typeof path !== "string")) throw new Error("Invalid file event.");
        if (!signal.aborted) await send(event);
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    try { await reader.cancel(); } catch { /* Aborted connection. */ }
    reader.releaseLock();
  }
}

export function parseWatchedFiles(value: unknown): WatchedFile[] {
  if (!Array.isArray(value) || !value.length || value.length > 64) throw new Error("Choose 1 to 64 open files to watch.");
  return value.map((file: unknown) => {
    if (!file || typeof file !== "object") throw new Error("Invalid watched file.");
    const { path, sessionId } = file as Record<string, unknown>;
    if (typeof path !== "string" || !path.startsWith("/") || path.length > 4096 || path.includes("\0") ||
        (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length > 256))) throw new Error("Invalid watched file.");
    return { path, sessionId } as WatchedFile;
  });
}
