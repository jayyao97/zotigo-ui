import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SessionTimeline } from "../src/conversation/ConversationTimeline";
import type { DisplayItem, ZotigoSession } from "../shared/zotigod";

test("a session snapshot older than a displayed tool result does not announce the tool as running", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false }) });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  const at = "2026-11-22T15:07:51Z";
  const items: DisplayItem[] = [
    { id: "turn", sequence: 1, type: "turn_started", turn: { id: "turn-1" }, created_at: at },
    { id: "call", sequence: 2, type: "assistant_message", content: [{ type: "tool_call", tool_call: { id: "call-shell", name: "shell", arguments: '{"command":"pkill -f demo"}' } }], created_at: at },
    { id: "result", sequence: 3, type: "assistant_message", content: [{ type: "tool_result", tool_result: { tool_call_id: "call-shell", text: "done" } }], created_at: at },
  ];
  const hint = async (session: ZotigoSession, extra: DisplayItem[] = []) => {
    await act(async () => root.render(<SessionTimeline
      binding={{ conversation_id: "s", daemon_session_id: "s", created_at: at }}
      session={session}
      items={[...items, ...extra]} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://localhost"
      streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
      submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}}
    />));
    return document.querySelector(".thinking-status")?.textContent ?? null;
  };
  const running: ZotigoSession = { id: "s", state: "running", live: true, working: true, created_at: at, active_tool: "shell" };
  try {
    assert.equal(await hint({ ...running, latest_item_sequence: 2 }), null);
    assert.equal(document.querySelectorAll(".tool-disclosure").length, 1);
    // A snapshot that already covers the result still reports daemon activity.
    assert.match(await hint({ ...running, latest_item_sequence: 3 }) ?? "", /shell/);
    // Live previews sort after durable items; only durable results make a snapshot stale.
    const preview: DisplayItem = { id: "preview", sequence: Number.MAX_SAFE_INTEGER - 1, type: "assistant_message", role: "assistant",
      content: [{ type: "tool_progress", tool_result: { tool_call_id: "call-other", text: "output" } }], created_at: at };
    assert.match(await hint({ ...running, latest_item_sequence: 3 }, [preview]) ?? "", /shell/);
    // Catalog rows carry no sequence, so they cannot be judged stale here.
    assert.match(await hint(running) ?? "", /shell/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
