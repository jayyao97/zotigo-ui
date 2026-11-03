import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { listCompletionTriggers, cancelCompletionTrigger, setDaemonBaseUrl } from "../backend/zotigod";
import { CompletionTriggers } from "../src/conversation/CompletionTriggers";
import { formatChannelOrigin } from "../shared/channelOrigin";

test("completion API supports old daemons and validates results", async () => {
  let status = 404;
  let payload: unknown = {};
  const paths: string[] = [];
  const server = http.createServer((request, response) => {
    paths.push(`${request.method} ${request.url}`);
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  try {
    assert.equal(await listCompletionTriggers("s"), null);
    status = 200; payload = { items: [{ id: "cb_1", title: "Build", on_fire: "Read the result", expires_at: "2030-01-01T00:00:00Z", policy: "private", token: "must-not-forward" }] };
    assert.deepEqual(await listCompletionTriggers("s"), [{ id: "cb_1", title: "Build", on_fire: "Read the result", expires_at: "2030-01-01T00:00:00Z" }]);
    await cancelCompletionTrigger("s/a", "cb/1");
    assert.equal(paths.at(-1), "DELETE /sessions/s%2Fa/completion-triggers/cb%2F1");
    payload = { items: [{ id: 3 }] };
    await assert.rejects(listCompletionTriggers("s"));
    status = 503; await assert.rejects(listCompletionTriggers("s"));
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("pending callback is visible, cancellable, and labelled as automation", async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let items = [{ id: "cb_1", title: "Build", on_fire: "Inspect build.log", expires_at: "2030-01-01T00:00:00Z" }];
  const client = {
    listCompletionTriggers: async () => items,
    cancelCompletionTrigger: async (id: string, trigger: string) => { assert.equal(id, "session"); assert.equal(trigger, "cb_1"); items = []; },
  };
  try {
    await act(async () => root.render(<CompletionTriggers client={client} sessionId="session" active={false} />));
    assert.match(document.body.textContent!, /Waiting for background tasks.*Build.*Inspect build.log/);
    await act(async () => document.querySelector<HTMLButtonElement>("button")!.click());
    assert.equal(document.querySelector("section"), null);
    assert.equal(formatChannelOrigin({ source: "completion_trigger", conversation_name: "Build", actor: { id: "cb_1", role: "automation" } }), "Background task notification · Build");
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of Object.entries(previous)) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
  }
});
