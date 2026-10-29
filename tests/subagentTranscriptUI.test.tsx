import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { SubagentTranscript, type SubagentRun } from "../src/conversation/SubagentPanel";

test("subagent transcript groups thinking, consumes result rows and shows pending tools", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const run: SubagentRun = {
    id: "review", name: "review", status: "running",
    history: [
      { role: "assistant", text: "", content: [{ type: "reasoning", text: "Checking the code" }] },
      { role: "assistant", text: "", content: [{ type: "tool_call", tool_call: { id: "done", name: "grep", arguments: '{"pattern":"test","path":"src"}' } }] },
      { role: "tool", text: "", content: [{ type: "tool_result", tool_result: { tool_call_id: "done", tool_name: "grep", text: "match" } }] },
      { role: "assistant", text: "", content: [{ type: "tool_call", tool_call: { id: "pending", name: "shell", arguments: '{"command":"go test ./..."}' } }] },
    ],
  };
  const html = renderToStaticMarkup(<SubagentTranscript run={run} thinkingDisplay="expanded" onBack={() => {}} />);
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll(".reasoning-group").length, 1);
  assert.equal(doc.querySelectorAll(".message-row.assistant").length, 3, "paired results must not leave an empty row");
  assert.equal(doc.querySelectorAll(".tool-disclosure.running").length, 1);
});
