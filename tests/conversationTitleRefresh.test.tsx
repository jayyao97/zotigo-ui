import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useConversationTitle } from "../src/useConversationTitle";
import type { DesktopState } from "../shared/clientTypes";
import type { DisplayItem } from "../shared/zotigod";

test("streamed completion generates once, preserves target across navigation, and retries failures with a bound", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const timers = new Map<number, { run: () => void; due: number }>();
  let timerID = 0;
  window.setTimeout = ((run: () => void, delay: number) => { timers.set(++timerID, { run, due: now + delay }); return timerID; }) as typeof window.setTimeout;
  window.clearTimeout = (id) => { if (typeof id === "number") timers.delete(id); };
  let conversation: { id: string; title: string } | null = { id: "a", title: "Hello" };
  const prompt = { id: "prompt", sequence: 1, type: "user_message", content: [{ type: "text", text: "Hello" }] } as DisplayItem;
  const completed = { id: "complete", sequence: 2, type: "turn_completed" } as DisplayItem;
  let items: DisplayItem[] = [prompt];
  let rejectRequests = false;
  let resolveRequest: (state: DesktopState) => void = () => {};
  const requested: string[] = [];
  const applied: string[][] = [];
  const suggest = (id: string) => {
    requested.push(id);
    return rejectRequests ? Promise.reject(new Error("temporary network failure")) : new Promise<DesktopState>((resolve) => { resolveRequest = resolve; });
  };
  const onTitle = (...args: [string, string, string]) => { applied.push(args); };
  function Harness() { useConversationTitle(conversation, items, suggest, onTitle); return null; }
  const render = () => act(async () => root.render(<StrictMode><Harness /></StrictMode>));
  const tick = (ms: number) => act(async () => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.run(); }
  });
  try {
    await render();
    assert.deepEqual(requested, []);
    // A completion arrives separately from the prompt, as on the SSE path.
    items = [...items, completed];
    await render();
    await render();
    assert.deepEqual(requested, ["a"]);
    conversation = { id: "b", title: "Manually named" };
    await render();
    await act(async () => resolveRequest({ conversations: [{ id: "a", title: "Generated title" }] } as DesktopState));
    assert.deepEqual(applied, [["a", "Hello", "Generated title"]]);
    conversation = { id: "a", title: "Hello" };
    await render();
    assert.equal(requested.length, 1);

    rejectRequests = true;
    conversation = { id: "retry", title: "Hello" };
    await render();
    assert.equal(requested.length, 2);
    await tick(4999);
    assert.equal(requested.length, 2);
    await tick(1);
    assert.equal(requested.length, 3);
    await tick(10000);
    assert.equal(requested.length, 4);
    await tick(60000);
    await render();
    assert.equal(requested.length, 4, "three total attempts per session");

    conversation = { id: "cancel", title: "Hello" };
    await render();
    assert.equal(timers.size, 1);
    await act(async () => root.unmount());
    assert.equal(timers.size, 0, "unmount cancels pending retry");
  } finally {
    Date.now = realNow;
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
