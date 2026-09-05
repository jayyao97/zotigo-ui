import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { writeSessionEvent } from "../web/eventStream";
import type { SessionEventEnvelope } from "../shared/clientTypes";

function item(text: string, sequence = 1): SessionEventEnvelope {
  return { session_id: "test", event: { type: "item", item: {
    id: `item-${sequence}`, sequence, type: "assistant_message",
    created_at: "2026-01-01T00:00:00Z", content: [{ type: "text", text }],
  } } };
}

test("Web SSE delivers an event larger than highWaterMark and the following event without truncation", { timeout: 5000 }, async () => {
  const large = item("x".repeat(200_000));
  const next = item("finished", 2);
  const server = createServer((_request, response) => {
    const controller = new AbortController();
    response.on("close", () => controller.abort());
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    void (async () => {
      await writeSessionEvent(response, large, controller.signal);
      await writeSessionEvent(response, next, controller.signal);
      response.end();
    })().catch(() => response.destroy());
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const text = await (await fetch(`http://127.0.0.1:${address.port}`)).text();
    const frames = text.trim().split("\n\n");
    assert.equal(frames.length, 2);
    assert.equal(frames[0], `id: 1\ndata: ${JSON.stringify(large)}`);
    assert.equal(frames[1], `id: 2\ndata: ${JSON.stringify(next)}`);
  } finally {
    server.closeAllConnections(); server.close(); await once(server, "close");
  }
});

test("Web SSE releases a writer awaiting drain when its consumer disconnects", { timeout: 5000 }, async () => {
  let resolveStopped!: () => void;
  const stopped = new Promise<void>((resolve) => { resolveStopped = resolve; });
  const server = createServer((_request, response) => {
    const controller = new AbortController();
    response.on("close", () => controller.abort());
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    void writeSessionEvent(response, item("x".repeat(8 * 1024 * 1024)), controller.signal)
      .catch(() => {}).finally(resolveStopped);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = get(`http://127.0.0.1:${address.port}`, (response) => {
    response.pause();
    response.destroy();
  });
  try { await stopped; } finally {
    request.destroy(); server.closeAllConnections(); server.close(); await once(server, "close");
  }
});
