import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SessionTimeline } from "../src/conversation/ConversationTimeline";
import { CompletionTriggerNavigation } from "../src/conversation/CompletionTriggerNavigation";
import type { DisplayItem } from "../shared/zotigod";

test("tools before and after callbacks fold independently and late results update the earlier group", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false }) });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  const item = (id: string, sequence: number, content: DisplayItem["content"]): DisplayItem => ({ id, sequence, type: "assistant_message", content, created_at: "2026-01-01T00:00:00Z" });
  const call = (id: string, sequence: number) => item(id, sequence, [{ type: "tool_call", tool_call: { id, name: "shell", arguments: '{"command":"pwd"}' } }]);
  const before = [call("first", 1), call("second", 2)];
  const callback = item("callback", 3, [
    { type: "tool_call", tool_call: { id: "cb", name: "zotigo.create_completion_trigger" } },
    { type: "tool_result", tool_result: { tool_call_id: "cb", json: { trigger_id: "cb_1" } } },
  ]);
  const after = [call("third", 6), call("fourth", 7)];
  const render = async (items: DisplayItem[]) => {
    await act(async () => root.render(<CompletionTriggerNavigation.Provider value={() => {}}><SessionTimeline
      binding={{ conversation_id: "s", daemon_session_id: "s", created_at: "now" }}
      session={{ id: "s", state: "ended", live: false, working: false, created_at: "now" }}
      items={items} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://localhost"
      streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
      submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}}
    /></CompletionTriggerNavigation.Provider>));
  };
  try {
    await render([...before, callback, ...after]);
    assert.equal(document.querySelectorAll(".historical-tool-group").length, 2);
    assert.ok(document.querySelector(".completion-open-link"));
    await act(async () => document.querySelector<HTMLButtonElement>(".historical-tool-group > button")!.click());
    assert.equal(document.querySelectorAll(".historical-tool-group .tool-disclosure").length, 0);
    const results = ["first", "second"].map((id, i) => item(`result-${id}`, 4 + i, [{ type: "tool_result", tool_result: { tool_call_id: id, text: `result for ${id}` } }]));
    await render([...before, callback, ...results, ...after]);
    const earlier = document.querySelector(".historical-tool-group")!;
    assert.equal(earlier.querySelectorAll(".tool-disclosure").length, 2);
    await act(async () => earlier.querySelector<HTMLButtonElement>(".tool-disclosure > button")!.click());
    assert.match(earlier.textContent!, /result for first/);
    assert.equal(document.querySelectorAll(".historical-tool-group").length, 2);
    assert.equal(document.querySelectorAll(".completion-open-link").length, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
