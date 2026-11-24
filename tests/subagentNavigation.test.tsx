import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SessionTimeline } from "../src/conversation/ConversationTimeline";
import { SubagentNavigation, type SubagentNavigationValue } from "../src/conversation/SubagentNavigation";
import type { DisplayItem, ZotigoSession } from "../shared/zotigod";

const at = "2026-01-01T00:00:00Z";
const spawn: DisplayItem = { id: "spawn", sequence: 2, type: "assistant_message", created_at: at, content: [{ type: "tool_call", tool_call: { id: "call-spawn", name: "spawn", arguments: '{"name":"reviewer","description":"Review the diff"}' } }] };
const shell: DisplayItem = { id: "shell", sequence: 3, type: "assistant_message", created_at: at, content: [{ type: "tool_call", tool_call: { id: "call-shell", name: "shell", arguments: '{"command":"pwd"}' } }] };
const spawnResult = (isError: boolean): DisplayItem => ({ id: "spawn-result", sequence: 4, type: "assistant_message", created_at: at, content: [{ type: "tool_result", tool_result: { tool_call_id: "call-spawn", tool_name: "spawn", text: isError ? "spawn failed" : "looks good", is_error: isError } }] });
const turn: DisplayItem = { id: "turn", sequence: 1, type: "turn_started", turn: { id: "turn-1" }, created_at: at };
const done: DisplayItem = { id: "done", sequence: 9, type: "turn_completed", turn: { id: "turn-1" }, created_at: at };

async function withTimeline(run: (render: (items: DisplayItem[], navigation: SubagentNavigationValue | null, session?: Partial<ZotigoSession>) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false }) });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  try {
    await run(async (items, navigation, session = {}) => {
      await act(async () => root.render(<SubagentNavigation.Provider value={navigation}><SessionTimeline
        binding={{ conversation_id: "s", daemon_session_id: "s", created_at: at }}
        session={{ id: "s", state: "ended", live: false, working: false, created_at: at, ...session }}
        items={items} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://localhost"
        streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
        submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}}
      /></SubagentNavigation.Provider>));
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
}

test("a spawn call inside a folded tool group opens its subagent transcript", async () => {
  await withTimeline(async render => {
    const opened: string[] = [];
    const navigation = { has: (id: string) => id === "call-spawn", open: (id: string) => { opened.push(id); } };
    await render([turn, spawn, shell, spawnResult(false), done], navigation);
    const group = document.querySelector<HTMLButtonElement>(".historical-tool-group > button");
    assert.ok(group, "completed tools fold into a group");
    await act(async () => group.click());
    const links = document.querySelectorAll<HTMLButtonElement>(".subagent-open-link > button");
    assert.equal(links.length, 1, "only the spawn call links to a transcript");
    await act(async () => links[0].click());
    assert.deepEqual(opened, ["call-spawn"]);
  });
});

test("a spawn call stays a plain tool row without a known transcript or after failing", async () => {
  await withTimeline(async render => {
    await render([spawn], null);
    assert.equal(document.querySelector(".subagent-open-link"), null, "no navigation");
    await render([spawn], { has: () => false, open: () => {} });
    assert.equal(document.querySelector(".subagent-open-link"), null, "unknown run");
    await render([turn, spawn, spawnResult(true), done], { has: () => true, open: () => {} });
    await act(async () => document.querySelector<HTMLButtonElement>(".historical-tool-group > button")!.click());
    assert.equal(document.querySelector(".subagent-open-link"), null, "failed spawn");
    assert.match(document.querySelector(".tool-disclosure.error")?.textContent ?? "", /spawn/);
  });
});

test("a running spawn link keeps the running tool style", async () => {
  await withTimeline(async render => {
    const running: DisplayItem = { id: "sub", sequence: 3, type: "assistant_message", role: "assistant", created_at: at, subagent: { tool_call_id: "call-spawn", name: "reviewer", status: "running" }, content: [{ type: "text", text: "checking" }] };
    await render([turn, spawn, running], { has: () => true, open: () => {} }, { state: "running", working: true });
    assert.ok(document.querySelector(".tool-disclosure.subagent-open-link.running"));
  });
});
