import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createSessionEvents } from "../backend/sessionEvents";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import type { SessionDisplayEvent } from "../shared/zotigod";

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

test("a replaced subscription cannot deliver stale events when its transport ignores abort", async () => {
  const subscriptions: Array<{
    onEvent: (event: SessionDisplayEvent) => void | Promise<void>;
    onConnected: () => void | Promise<void>;
    signal: AbortSignal;
  }> = [];
  const never = new Promise<void>(() => undefined);
  const stream = async (
    _id: string,
    _after: number | undefined,
    onEvent: (event: SessionDisplayEvent) => void | Promise<void>,
    onConnected: () => void | Promise<void>,
    signal: AbortSignal,
  ) => {
    subscriptions.push({ onEvent, onConnected, signal });
    await never;
  };
  const delivered: string[] = [];
  const events = createSessionEvents((envelope) => {
    if (envelope.event?.type === "delta") delivered.push(envelope.event.delta.delta);
  }, stream);

  events.start("session");
  await Promise.resolve();
  events.start("session");
  await Promise.resolve();
  assert.equal(subscriptions.length, 2);
  assert.equal(subscriptions[0]?.signal.aborted, true);

  const delta = (text: string): SessionDisplayEvent => ({
    type: "delta",
    delta: { item_id: "message", role: "assistant", part_type: "text", delta: text },
  });
  await subscriptions[0]?.onConnected();
  await subscriptions[0]?.onEvent(delta("stale"));
  await subscriptions[1]?.onConnected();
  await subscriptions[1]?.onEvent(delta("current"));
  assert.deepEqual(delivered, ["current"]);
  events.stop();
});
