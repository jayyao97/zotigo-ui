import assert from "node:assert/strict";
import test from "node:test";

import { defaultThinkingDisclosureOpen, latestReasoningItemId, parseThinkingDisplayMode } from "../src/thinkingDisplay";
import type { DisplayItem } from "../shared/zotigod";

test("parseThinkingDisplayMode accepts supported values and defaults to expanded", () => {
  assert.equal(parseThinkingDisplayMode("auto"), "expanded");
  assert.equal(parseThinkingDisplayMode("expanded"), "expanded");
  assert.equal(parseThinkingDisplayMode("collapsed"), "collapsed");
  assert.equal(parseThinkingDisplayMode("latest"), "latest");
  assert.equal(parseThinkingDisplayMode("unexpected"), "expanded");
  assert.equal(parseThinkingDisplayMode(null), "expanded");
});

test("defaultThinkingDisclosureOpen follows the selected display mode", () => {
  assert.equal(defaultThinkingDisclosureOpen("expanded", true), true);
  assert.equal(defaultThinkingDisclosureOpen("expanded", false), true);
  assert.equal(defaultThinkingDisclosureOpen("collapsed", true), false);
  assert.equal(defaultThinkingDisclosureOpen("collapsed", false), false);
  assert.equal(defaultThinkingDisclosureOpen("latest", true), true);
  assert.equal(defaultThinkingDisclosureOpen("latest", false), false);
});

test("latestReasoningItemId ignores tools and text after the newest Thinking block", () => {
  const items: DisplayItem[] = [
    assistant("reasoning-1", 1, "reasoning"),
    { id: "tool", sequence: 2, type: "assistant_message", role: "assistant", content: [{ type: "tool_call", tool_call: { id: "call", name: "shell" } }], created_at: "now" },
    assistant("reasoning-2", 3, "reasoning"),
    assistant("answer", 4, "text"),
  ];
  assert.equal(latestReasoningItemId(items), "reasoning-2");
  assert.equal(latestReasoningItemId(items.slice(1, 2)), undefined);
});

function assistant(id: string, sequence: number, type: "reasoning" | "text"): DisplayItem {
  return { id, sequence, type: "assistant_message", role: "assistant", content: [{ type, text: id }], created_at: "now" };
}
