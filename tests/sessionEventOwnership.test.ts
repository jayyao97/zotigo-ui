import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createSessionEvents } from "../backend/sessionEvents";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";

test("stopping one subscription aborts only its daemon reader and leaves another client live", { timeout: 5000 }, async () => {
  const original = getDaemonConfig().baseUrl;
  const responses = new Map<string, ServerResponse>();
  let ready!: () => void;
  const connected = new Promise<void>((resolve) => { ready = resolve; });
  const server = createServer((request, response) => {
    responses.set(request.url!, response);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(": connected\n\n");
    if (responses.size === 2) ready();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  let delivered!: () => void;
  const received = new Promise<void>((resolve) => { delivered = resolve; });
  const first = createSessionEvents(() => {});
  const second = createSessionEvents((event) => { if (event.event?.type === "delta") delivered(); });
  try {
    first.start("a"); second.start("b"); await connected;
    const firstClosed = once(responses.get("/sessions/a/events")!, "close");
    first.stop(); await firstClosed;
    const secondResponse = responses.get("/sessions/b/events")!;
    assert.equal(secondResponse.destroyed, false);
    secondResponse.write('event: delta\ndata: {"item_id":"message","role":"assistant","part_type":"text","delta":"still alive"}\n\n');
    await received;
    assert.equal(secondResponse.destroyed, false);
  } finally {
    first.stop(); second.stop();
    server.closeAllConnections(); server.close(); await once(server, "close");
    setDaemonBaseUrl(original);
  }
});
