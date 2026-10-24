import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { optimisticPromptDisplayItem } from "../shared/sessionDisplay";
import { InputQueue } from "../src/conversation/InputQueue";
import type { DisplayItem, QueuedInput } from "../shared/zotigod";

test("queued messages edit and delete by revision and lock once sending", async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let items: QueuedInput[] = [{ id: "a", sequence: 0, type: "message", text: "First message", images: [{ url: "/sessions/s/images/one" }, { url: "/sessions/s/images/two" }], created_at: "", revision: 3, state: "queued", editable: true }, { id: "b", sequence: 0, type: "message", text: "Second message", created_at: "", revision: 1, state: "sending", editable: false }];
  let failSend = true;
  const client = {
    listQueuedInputs: async () => items,
    editQueuedInput: async (id: string, itemId: string, revision: number, text: string, imageIndices?: number[]) => { if (!items[0].image_editing_supported) { assert.equal(imageIndices, undefined); return; } assert.deepEqual(imageIndices, [1]); assert.equal(id, "s"); assert.equal(itemId, "a"); assert.equal(revision, 3); items = items.map(item => item.id === itemId ? { ...item, text, images: imageIndices?.map(index => item.images![index]), revision: 4 } : item); },
    deleteQueuedInput: async (_id: string, itemId: string, revision: number) => { assert.equal(revision, 4); items = items.filter(item => item.id !== itemId); },
    resumeInputQueue: async () => {},
    sendQueuedInput: async (_id: string, itemId: string, revision: number) => { assert.equal(revision, 1); if (failSend) throw new Error("Worker unavailable"); items = items.filter(item => item.id !== itemId); },
  };
  try {
    const preview = { ...optimisticPromptDisplayItem({ id: "pending", text: "Queued preview", steering: false, createdAt: "" }), queuedPreview: true };
    const slowClient = { ...client, listQueuedInputs: () => new Promise<QueuedInput[]>(() => {}) };
    await act(async () => root.render(<InputQueue client={slowClient} sessionId="s" refresh={0} active={false} pending={[preview]} />));
    assert.match(document.querySelector(".input-queue")!.textContent!, /Queued preview/);
    assert.match(document.body.textContent!, /Adding to queue/);
    let retried = false;
    await act(async () => root.render(<InputQueue client={slowClient} sessionId="s" refresh={0} active={false} pending={[{ ...preview, delivery: { state: "failed" } }]} onRetry={() => { retried = true; }} />));
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Retry")!.click());
    assert.equal(retried, true);
    const confirmed = { ...preview, queueConfirmed: true };
    await act(async () => root.render(<InputQueue client={slowClient} sessionId="s" refresh={0} active={false} pending={[confirmed]} />));
    assert.match(document.body.textContent!, /Queued/);
    let reconciled: string[] = [];
    await act(async () => root.render(<InputQueue client={client} sessionId="s" refresh={1} active={false} pending={[confirmed]} onReconciled={ids => { reconciled = ids; }} />));
    assert.deepEqual(reconciled, ["pending"]);
    // A lost POST response is resolved by a later GET, even if the preview
    // was added while that GET was in flight.
    let resolveList!: (items: QueuedInput[]) => void;
    const delayedClient = { ...client, listQueuedInputs: () => new Promise<QueuedInput[]>(resolve => { resolveList = resolve; }) };
    let pending: DisplayItem[] = [];
    let staleCallbackUsed = false;
    await act(async () => root.render(<InputQueue client={delayedClient} sessionId="s" refresh={0} active={false} pending={pending} onReconciled={() => { staleCallbackUsed = true; }} />));
    pending = [{ ...preview, delivery: { state: "failed" } }];
    const reconcile = (ids: string[]) => { reconciled = ids; pending = pending.filter(item => !ids.includes(item.id)); };
    await act(async () => root.render(<InputQueue client={delayedClient} sessionId="s" refresh={0} active={false} pending={pending} onReconciled={reconcile} />));
    await act(async () => resolveList([{ ...items[0], id: preview.id, text: "Queued preview" }]));
    assert.equal(staleCallbackUsed, false);
    assert.deepEqual(reconciled, ["pending"]);
    assert.deepEqual(pending, []);
    await act(async () => root.render(<InputQueue client={delayedClient} sessionId="s" refresh={1} active={false} pending={pending} onReconciled={reconcile} />));
    await act(async () => resolveList([]));
    assert.equal(document.querySelector(".input-queue"), null, "sent or deleted entry must not revive the failed preview");

    // An empty response cannot confirm an unknown submission or a POST
    // acknowledged only after the GET started.
    pending = [{ ...preview, delivery: { state: "failed" } }];
    await act(async () => root.render(<InputQueue client={delayedClient} sessionId="s" refresh={2} active={false} pending={pending} onReconciled={reconcile} />));
    pending = [{ ...pending[0], queueConfirmed: true }];
    await act(async () => root.render(<InputQueue client={delayedClient} sessionId="s" refresh={2} active={false} pending={pending} onReconciled={reconcile} />));
    await act(async () => resolveList([]));
    assert.equal(pending.length, 1, "stale GET must not clear a newer acknowledgment");
    await act(async () => root.render(<InputQueue client={delayedClient} sessionId="s" refresh={3} active={false} pending={pending} onReconciled={reconcile} />));
    await act(async () => resolveList([]));
    assert.deepEqual(pending, [], "fresh GET may reconcile an already acknowledged entry");
    await act(async () => root.render(<InputQueue daemonUrl="http://localhost:1234" client={client} sessionId="s" refresh={0} active={false} />));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Edit queued message"]')!.click());
    assert.equal(document.querySelector('[aria-label="Remove image 1"]'), null);
    assert.equal(document.querySelectorAll(".queue-editor img").length, 2);
    assert.match(document.body.textContent!, /Images will be kept/);
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Save")!.click());
    items = items.map(item => ({ ...item, image_editing_supported: true }));
    await act(async () => root.render(<InputQueue daemonUrl="http://localhost:1234" client={client} sessionId="s" refresh={10} active={false} />));
    const edits = document.querySelectorAll<HTMLButtonElement>('[aria-label="Edit queued message"]');
    assert.equal(edits[1].disabled, true);
    await act(async () => edits[0].click());
    assert.equal(document.querySelector<HTMLTextAreaElement>("textarea")!.value, "First message");
    assert.equal(document.querySelectorAll(".queue-editor img").length, 2);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Remove image 1"]')!.click());
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Cancel")!.click());
    assert.equal(document.querySelectorAll(".queue-message img").length, 2);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Edit queued message"]')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Remove image 1"]')!.click());
    assert.equal(document.querySelectorAll(".queue-editor img").length, 1);
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Save")!.click());
    assert.equal(document.querySelectorAll(".queue-message img").length, 1);
    assert.equal(document.querySelector("textarea"), null);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Delete queued message"]')!.click());
    assert.equal(document.querySelectorAll("li").length, 1);
    assert.match(document.body.textContent!, /Second message/);
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Send now"]')!.disabled, true);
    items = [...items, { id: "c", sequence: 0, type: "message", text: "Send this now", created_at: "", revision: 1, state: "queued", editable: true }];
    await act(async () => root.render(<InputQueue daemonUrl="http://localhost:1234" client={client} sessionId="s" refresh={1} active={false} />));
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
