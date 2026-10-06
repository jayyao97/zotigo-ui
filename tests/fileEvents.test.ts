import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createFileEvents, streamFileEvents } from "../backend/fileEvents";
import { setDaemonBaseUrl } from "../backend/zotigod";
import type { FileEventEnvelope } from "../shared/fileEvents";

test("file SSE handles split frames, aborts promptly, and stops unsupported daemons", async () => {
  let unsupported = false;
  let calls = 0;
  const server = createServer(async (request, response) => {
    calls++;
    assert.equal(request.url, "/files/events");
    if (unsupported) { response.writeHead(404); response.end(); return; }
    let body = ""; for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { files: [{ path: "/file", explicitOpen: true }] });
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write('data: {"type":"ready",'); response.write('"paths":[]}\n\ndata: {"type":"changed","paths":["/file"]}\n\n');
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const controller = new AbortController();
  try {
    const received: string[] = [];
    await streamFileEvents([{ path: "/file" }], (event) => { received.push(event.type); if (event.type === "changed") controller.abort(); }, controller.signal);
    assert.deepEqual(received, ["ready", "changed"]);
    unsupported = true;
    let resolve!: (event: FileEventEnvelope) => void;
    const event = new Promise<FileEventEnvelope>((done) => { resolve = done; });
    const subscription = createFileEvents(resolve);
    subscription.start("id", [{ path: "/file" }]);
    assert.deepEqual(await event, { subscriptionId: "id", type: "unavailable", paths: ["/file"] });
    subscription.stop(); assert.equal(calls, 2);
  } finally {
    controller.abort(); server.closeAllConnections(); server.close(); await once(server, "close");
  }
});

test("replacing a subscription cancels its watcher and discards late events", async () => {
  const streams: { signal: AbortSignal; send: Parameters<typeof streamFileEvents>[1] }[] = [];
  const received: FileEventEnvelope[] = [];
  const subscription = createFileEvents((event) => { received.push(event); }, async (_files, send, signal) => {
    streams.push({ signal, send });
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
  });
  subscription.start("old", [{ path: "/a" }]);
  subscription.start("new", [{ path: "/b" }]);
  assert.equal(streams[0].signal.aborted, true);
  await streams[0].send({ type: "changed", paths: ["/a"] });
  await streams[1].send({ type: "ready", paths: [] });
  assert.deepEqual(received, [{ subscriptionId: "new", type: "ready", paths: [] }]);
  subscription.stop(); assert.equal(streams[1].signal.aborted, true);
});
