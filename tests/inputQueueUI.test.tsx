import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { InputQueue } from "../src/conversation/InputQueue";
import type { QueuedInput } from "../shared/zotigod";

test("queued messages edit and delete by revision and lock once sending", async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let items: QueuedInput[] = [{ id: "a", sequence: 0, type: "message", text: "First message", created_at: "", revision: 3, state: "queued", editable: true }, { id: "b", sequence: 0, type: "message", text: "Second message", created_at: "", revision: 1, state: "sending", editable: false }];
  let failSend = true;
  const client = {
    listQueuedInputs: async () => items,
    editQueuedInput: async (id: string, itemId: string, revision: number, text: string) => { assert.equal(id, "s"); assert.equal(itemId, "a"); assert.equal(revision, 3); items = items.map(item => item.id === itemId ? { ...item, text, revision: 4 } : item); },
    deleteQueuedInput: async (_id: string, itemId: string, revision: number) => { assert.equal(revision, 4); items = items.filter(item => item.id !== itemId); },
    resumeInputQueue: async () => {},
    sendQueuedInput: async (_id: string, itemId: string, revision: number) => { assert.equal(revision, 1); if (failSend) throw new Error("Worker unavailable"); items = items.filter(item => item.id !== itemId); },
  };
  try {
    await act(async () => root.render(<InputQueue client={client} sessionId="s" refresh={0} active={false} />));
    const edits = document.querySelectorAll<HTMLButtonElement>('[aria-label="Edit queued message"]');
    assert.equal(edits[1].disabled, true);
    await act(async () => edits[0].click());
    assert.equal(document.querySelector<HTMLTextAreaElement>("textarea")!.value, "First message");
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Save")!.click());
    assert.equal(document.querySelector("textarea"), null);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Delete queued message"]')!.click());
    assert.equal(document.querySelectorAll("li").length, 1);
    assert.match(document.body.textContent!, /Second message/);
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Send now"]')!.disabled, true);
    items = [...items, { id: "c", sequence: 0, type: "message", text: "Send this now", created_at: "", revision: 1, state: "queued", editable: true }];
    await act(async () => root.render(<InputQueue client={client} sessionId="s" refresh={1} active={false} />));
    await act(async () => document.querySelectorAll<HTMLButtonElement>('[aria-label="Send now"]')[1].click());
    assert.equal(document.querySelectorAll("li").length, 2);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Worker unavailable/);
    failSend = false;
    await act(async () => document.querySelectorAll<HTMLButtonElement>('[aria-label="Send now"]')[1].click());
    assert.equal(document.querySelectorAll("li").length, 1);
    assert.doesNotMatch(document.body.textContent!, /Send this now/);
    let unsupportedCalls = 0;
    await act(async () => root.render(<InputQueue client={{ ...client, listQueuedInputs: async () => { unsupportedCalls++; return null; } }} sessionId="s" refresh={0} active={true} />));
    assert.equal(document.querySelector(".input-queue"), null);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
    assert.equal(unsupportedCalls, 1, "unsupported queue must not keep polling");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
