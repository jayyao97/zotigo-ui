import assert from "node:assert/strict";
import { test } from "node:test";

import { buildToolRenderProjection } from "../shared/sessionDisplay";
import { buildSubagentRuns } from "../src/conversation/SubagentPanel";
import type { DisplayItem } from "../shared/zotigod";

test("subagent runs expose incremental content and approval status before spawn completes", () => {
  const items: DisplayItem[] = [
    {
      id: "spawn-call",
      sequence: 1,
      type: "assistant_message",
      role: "assistant",
      content: [{
        type: "tool_call",
        tool_call: {
          id: "spawn-1",
          name: "spawn",
          arguments: JSON.stringify({ name: "reviewer", description: "Review the change", workdir: "/tmp/project" }),
        },
      }],
      created_at: "2026-09-09T00:00:00Z",
    },
    {
      id: "child-text",
      sequence: 2,
      type: "assistant_message",
      role: "assistant",
      content: [{ type: "text", text: "Checking tests" }],
      subagent: { tool_call_id: "spawn-1", name: "reviewer", status: "running" },
      created_at: "2026-09-09T00:00:01Z",
    },
    {
      id: "child-tool",
      sequence: 3,
      type: "assistant_message",
      role: "assistant",
      content: [{ type: "tool_call", tool_call: { id: "child-call", name: "shell", arguments: "{}" } }],
      subagent: { tool_call_id: "spawn-1", name: "reviewer", status: "running" },
      created_at: "2026-09-09T00:00:02Z",
    },
    {
      id: "child-waiting",
      sequence: 4,
      type: "assistant_message",
      role: "assistant",
      subagent: { tool_call_id: "spawn-1", name: "reviewer", status: "waiting_approval" },
      created_at: "2026-09-09T00:00:03Z",
    },
  ];

  const runs = buildSubagentRuns(items);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "waiting_approval");
  assert.deepEqual(runs[0].history.map((entry) => entry.text), ["Checking tests", "Shell()"]);
});

test("final spawn result replaces incremental history with the authoritative child history", () => {
  const items: DisplayItem[] = [
    {
      id: "spawn-call",
      sequence: 1,
      type: "assistant_message",
      role: "assistant",
      content: [{ type: "tool_call", tool_call: { id: "spawn-1", name: "spawn", arguments: "{}" } }],
      created_at: "2026-09-09T00:00:00Z",
    },
    {
      id: "child-text",
      sequence: 2,
      type: "assistant_message",
      role: "assistant",
      content: [{ type: "text", text: "partial" }],
      subagent: { tool_call_id: "spawn-1", status: "running" },
      created_at: "2026-09-09T00:00:01Z",
    },
    {
      id: "spawn-result",
      sequence: 3,
      type: "assistant_message",
      role: "assistant",
      content: [{
        type: "tool_result",
        tool_result: {
          tool_call_id: "spawn-1",
          tool_name: "spawn",
          text: "done",
          metadata: { subagent: { name: "reviewer", history: [{ role: "assistant", content: [{ type: "text", text: "final" }] }] } },
        },
      }],
      created_at: "2026-09-09T00:00:02Z",
    },
  ];

  const runs = buildSubagentRuns(items);
  assert.equal(runs[0].status, "completed");
  assert.deepEqual(runs[0].history.map((entry) => entry.text), ["final"]);
});

test("failed spawn results retain child progress when no final history is available", () => {
  const items: DisplayItem[] = [
    {
      id: "spawn-call",
      sequence: 1,
      type: "assistant_message",
      role: "assistant",
      content: [{ type: "tool_call", tool_call: { id: "spawn-1", name: "spawn", arguments: "{}" } }],
      created_at: "2026-09-09T00:00:00Z",
    },
    {
      id: "child-text",
      sequence: 2,
      type: "assistant_message",
      role: "assistant",
      content: [{ type: "text", text: "Reached the failing command" }],
      subagent: { tool_call_id: "spawn-1", status: "running" },
      created_at: "2026-09-09T00:00:01Z",
    },
    {
      id: "spawn-result",
      sequence: 3,
      type: "assistant_message",
      role: "assistant",
      content: [{
        type: "tool_result",
        tool_result: { tool_call_id: "spawn-1", tool_name: "spawn", text: "subagent failed", is_error: true },
      }],
      created_at: "2026-09-09T00:00:02Z",
    },
  ];

  const runs = buildSubagentRuns(items);
  assert.equal(runs[0].status, "failed");
  assert.deepEqual(runs[0].history.map((entry) => entry.text), ["Reached the failing command"]);
});

test("subagent progress creates a run without the paged-out spawn item", () => {
  const runs = buildSubagentRuns([{
    id: "child-text",
    sequence: 201,
    type: "assistant_message",
    role: "assistant",
    content: [{ type: "text", text: "Still reviewing" }],
    subagent: { tool_call_id: "spawn-1", name: "reviewer", status: "running" },
    created_at: "2026-09-09T00:03:21Z",
  }]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, "spawn-1");
  assert.equal(runs[0].name, "reviewer");
  assert.deepEqual(runs[0].history.map((entry) => entry.text), ["Still reviewing"]);
});

test("error-only subagent events preserve the failure reason", () => {
  const runs = buildSubagentRuns([{
    id: "child-error",
    sequence: 2,
    type: "assistant_message",
    role: "assistant",
    error: "command exited with status 2",
    subagent: { tool_call_id: "spawn-1", name: "reviewer", status: "failed" },
    created_at: "2026-09-09T00:00:01Z",
  }]);

  assert.equal(runs[0].status, "failed");
  assert.deepEqual(runs[0].history.map((entry) => entry.text), ["command exited with status 2"]);
});

test("requested spawns wait for actual child start and leave the queue when the turn stops", () => {
  const call: DisplayItem = {
    id: "calls", type: "assistant_message", sequence: 1, created_at: "",
    content: ["one", "two", "three"].map(id => ({
      type: "tool_call", tool_call: { id, name: "spawn", arguments: "{}" },
    })),
  };
  const status = (id: string, value: "running" | "completed", sequence: number): DisplayItem => ({
    id: String(sequence), sequence, type: "assistant_message", created_at: "",
    subagent: { tool_call_id: id, status: value },
  });
  const items = [call, status("one", "running", 2)];
  const states = () => buildSubagentRuns(items).map(run => run.status);
  assert.deepEqual(states(), ["running", "queued", "queued"]);
  assert.deepEqual([...buildToolRenderProjection(items).runningSpawns], ["one"]);
  items.push(status("one", "completed", 3), status("two", "running", 4));
  assert.deepEqual(states(), ["completed", "running", "queued"]);
  assert.deepEqual([...buildToolRenderProjection(items).runningSpawns], ["two"]);
  items.push({ id: "stop", sequence: 5, created_at: "", type: "turn_interrupted" });
  assert.deepEqual(states(), ["completed", "interrupted", "interrupted"]);
});
