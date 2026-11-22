import test from "node:test";
import assert from "node:assert/strict";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { timelineRows } from "../src/core/timelineRows";

let sequence = 0;
const item = (id: string, type: string, content: DisplayItem["content"] = []): DisplayItem =>
  ({
    id,
    sequence: ++sequence,
    type,
    created_at: "2026-01-01T00:00:00Z",
    content,
  }) as DisplayItem;
const user = (id: string) => item(id, "user_message", [{ type: "text", text: id }]);
const reasoning = (id: string) =>
  item(id, "assistant_message", [{ type: "reasoning", text: "thinking " + id }]);
const toolCall = (id: string) =>
  item(id, "assistant_message", [
    { type: "tool_call", tool_call: { id: "call-" + id, name: "read_file", arguments: "{}" } },
  ]);
const answer = (id: string) => item(id, "assistant_message", [{ type: "text", text: id }]);
const keys = (rows: ReturnType<typeof timelineRows>) => rows.map((row) => `${row.kind}:${row.key}`);
const base = { thinkingMode: "collapsed" as const, disclosures: {} };

test("finished tool runs fold into one closed activity row that an explicit choice opens", () => {
  const items = [user("u"), toolCall("t1"), toolCall("t2"), answer("a")];
  assert.deepEqual(keys(timelineRows(items, base)), [
    "item:u",
    "activity:tools:t1",
    "item:a",
  ]);
  const opened = timelineRows(items, { ...base, disclosures: { "tools:t1": true } });
  assert.deepEqual(keys(opened), ["item:u", "activity:tools:t1", "item:t1", "item:t2", "item:a"]);
  assert.ok(opened.every((row) => row.kind !== "item" || !["t1", "t2"].includes(row.key) || row.revealReasoning));
});

test("tools of the running turn start open, and an explicit collapse still wins", () => {
  const started = item("start", "turn_started");
  const items = [user("u"), started, toolCall("t1")];
  const running = { ...base, activeTurnSequence: started.sequence };
  assert.deepEqual(keys(timelineRows(items, running)), [
    "item:u",
    "item:start",
    "activity:tools:t1",
    "item:t1",
  ]);
  assert.deepEqual(
    keys(timelineRows(items, { ...running, disclosures: { "tools:t1": false } })),
    ["item:u", "item:start", "activity:tools:t1"],
  );
});

test("reasoning follows the thinking preference, except for Codex which stays collapsed", () => {
  const items = [user("u"), reasoning("r1"), answer("a1"), reasoning("r2"), answer("a2")];
  const open = (rows: ReturnType<typeof timelineRows>) =>
    rows.flatMap((row) => (row.kind === "activity" ? [row.open] : []));
  assert.deepEqual(open(timelineRows(items, { ...base, thinkingMode: "collapsed" })), [false, false]);
  assert.deepEqual(open(timelineRows(items, { ...base, thinkingMode: "expanded" })), [true, true]);
  // "latest" opens only the most recent reasoning block.
  assert.deepEqual(open(timelineRows(items, { ...base, thinkingMode: "latest" })), [false, true]);
  assert.deepEqual(
    open(timelineRows(items, { ...base, thinkingMode: "expanded", agent: "codex" })),
    [false, false],
  );
});

test("row keys are unique so the list can keep stable identities", () => {
  const items = [user("u"), reasoning("r"), toolCall("t1"), toolCall("t2"), answer("a")];
  const rows = timelineRows(items, { ...base, thinkingMode: "expanded", disclosures: { "tools:t1": true } });
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});
