import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { SessionTimeline, UserMessage } from "../src/conversation/ConversationTimeline";
import { acknowledgeOptimisticPrompt, anchorPromptTimeline, appendDisplayDeltas, capturePromptTimelineAnchor, ephemeralDisplayItems, mergeDisplayItems, optimisticPromptDisplayItem, orderDisplayInputs, reconcileOptimisticSteering, type PromptTimelineAnchor } from "../shared/sessionDisplay";
import { inputDeliveryFailure, ZotigodRequestError } from "../backend/zotigod";
import type { DisplayItem } from "../shared/zotigod";

test("accepted steering remains visible during thinking and is replaced once applied", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const createdAt = "2026-01-01T00:00:00Z";
  const prompt = "Please check the test results first";
  const optimistic = optimisticPromptDisplayItem({ id: "input-1", text: prompt, steering: true, createdAt });
  const accepted: DisplayItem = {
    id: "input-1", sequence: 2, type: "session_command", created_at: createdAt,
    content: [{ type: "text", text: prompt }],
    command: { type: "steering", turn_id: "turn-1", text: prompt },
  };
  const turn: DisplayItem = { id: "turn", sequence: 1, type: "turn_started", turn: { id: "turn-1" }, created_at: createdAt };
  const thinking: DisplayItem = { id: "thinking", sequence: Number.MAX_SAFE_INTEGER - 1, type: "assistant_message", content: [{ type: "reasoning", text: "Still thinking" }], created_at: createdAt };
  const render = (items: DisplayItem[]) => new JSDOM(renderToStaticMarkup(<SessionTimeline
    binding={{ conversation_id: "s", daemon_session_id: "s", created_at: createdAt }}
    session={{ id: "s", agent: "zotigo", state: "running", live: true, working: true, created_at: createdAt }}
    items={items} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://127.0.0.1:18766"
    streamingItemIds={new Set([thinking.id])} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
    submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}}
  />));
  assert.deepEqual(reconcileOptimisticSteering([optimistic], [accepted]), []);
  assert.equal(acknowledgeOptimisticPrompt(optimistic, { id: accepted.id, sequence: 2, type: "steering", text: prompt, turn_id: "turn-1", created_at: createdAt }, [accepted]), null);
  for (const item of [accepted, { ...accepted, content: undefined }]) {
    const dom = render([turn, item, thinking]);
    const bubbles = dom.window.document.querySelectorAll(".message-row.user");
    assert.equal(bubbles.length, 1);
    assert.match(bubbles[0].textContent!, /Please check the test results first/);
    assert.match(bubbles[0].textContent!, /Steering · Pending/);
    dom.window.close();
  }
  const applied: DisplayItem = { ...accepted, type: "steering_message", sequence: 4, turn: { id: "turn-1" } };
  const dom = render(mergeDisplayItems([turn, accepted, { ...thinking, sequence: 3 }], [applied]));
  assert.equal(dom.window.document.querySelectorAll(".message-row.user").length, 1);
  assert.match(dom.window.document.querySelector(".message-row.user")!.textContent!, /Please check the test results first/);
  assert.doesNotMatch(dom.window.document.body.textContent!, /Pending/);
  dom.window.close();
});

test("prompt delivery is visible before acknowledgement and fails without removing the message", () => {
  const item = optimisticPromptDisplayItem({ id: "client-id", text: "Please continue", steering: false, createdAt: "2026-01-01T00:00:00Z" });
  const pending = renderToStaticMarkup(<UserMessage text="Please continue" delivery={item.delivery} />);
  assert.match(pending, /Sending…/);
  assert.match(pending, /Please continue/);
  const failed = renderToStaticMarkup(<UserMessage text="Please continue" delivery={{ state: "failed", error: "Network timeout" }} onRetry={() => {}} />);
  assert.match(failed, /Could not confirm delivery/);
  assert.match(failed, /Retry/);
  assert.match(failed, /Please continue/);
  const accepted = acknowledgeOptimisticPrompt(item, { id: item.id, sequence: 2, type: "message", text: "Please continue", created_at: item.created_at }, []);
  assert.equal(accepted?.delivery, undefined);
  assert.equal(accepted?.id, "client-id");
  const rejected = renderToStaticMarkup(<UserMessage text="Please continue" delivery={{ state: "rejected", error: "Compaction is in progress" }} onRestore={() => {}} onDismiss={() => {}} />);
  assert.match(rejected, /Compaction is in progress/);
  assert.match(rejected, /Restore draft/);
  assert.match(rejected, /Delete/);
  assert.doesNotMatch(rejected, /Retry|Could not confirm delivery/);
});

test("only definite daemon refusals enable editing a failed prompt", () => {
  for (const code of ["input_failed", "command_pending", "command_id_conflict"]) {
    assert.equal(inputDeliveryFailure(new ZotigodRequestError(409, "Conflict", code, code)), "unknown");
  }
  assert.equal(inputDeliveryFailure(new Error("Network timeout")), "unknown");
  assert.equal(inputDeliveryFailure(new ZotigodRequestError(503, "Unavailable", "timeout")), "unknown");
  assert.equal(inputDeliveryFailure(new ZotigodRequestError(409, "Conflict", "compacting", "active_turn")), "rejected");
});

test("daemon steering boundaries survive completion, refresh and missing paginated inputs", () => {
  const item = (id: string, sequence: number): DisplayItem => ({ id, sequence, type: "assistant_message", created_at: "" });
  const prompt: DisplayItem = { ...item("prompt", 2), type: "session_command", command: { type: "steering" } };
  const first = [item("turn", 1), prompt];
  const blocks = appendDisplayDeltas([], [
    { item_id: "thinking", role: "assistant", part_type: "reasoning", delta: "old thinking" },
    { item_id: "thinking", role: "assistant", part_type: "reasoning", delta: "", before_input_id: "prompt" },
  ], first);
  const ids = (items: DisplayItem[]) => orderDisplayInputs(items).map(item => item.id);
  assert.deepEqual(ids([...first, ...ephemeralDisplayItems(blocks)]), ["turn", "thinking", "prompt"]);
  const completed = [...first, { ...item("thinking", 3), before_input_id: "prompt" },
    { ...item("call", 4), before_input_id: "prompt" }, { ...item("result", 5), before_input_id: "prompt" }];
  assert.deepEqual(ids(JSON.parse(JSON.stringify(completed))), ["turn", "thinking", "call", "result", "prompt"]);
  const applied = mergeDisplayItems(completed, [{ ...prompt, sequence: 6, type: "steering_message" }, item("new", 7)]);
  assert.deepEqual(ids(applied), ["turn", "thinking", "call", "result", "prompt", "new"]);
  assert.deepEqual(ids(completed.filter(item => item.id !== "prompt")), ["turn", "thinking", "call", "result"]);
  assert.deepEqual(ids([item("legacy", 3), item("old", 4)]), ["legacy", "old"]);
});

test("position-only deltas never create unseen previews after reconnect", () => {
  const delta = { item_id: "unseen", role: "assistant", part_type: "reasoning", delta: "", before_input_id: "steer" } as const;
  assert.deepEqual(appendDisplayDeltas([], [delta], []), []);
  const blocks = appendDisplayDeltas([], [{ ...delta, delta: "thinking", before_input_id: undefined }], []);
  const updated = appendDisplayDeltas(blocks, [delta], []);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].text, "thinking");
  assert.equal(updated[0].beforeInputID, "steer");
});

test("streaming block stays before steering across acknowledgement and durable completion", () => {
  const created_at = "2026-01-01T00:00:00Z";
  const item = (id: string, sequence: number, type: DisplayItem["type"] = "assistant_message"): DisplayItem => ({ id, sequence, type, created_at });
  const anchors = new Map<string, PromptTimelineAnchor>([["prompt", { sequence: 1, previews: ["thinking"] }]]);
  const first = item("turn", 1, "turn_started");
  const prompt = optimisticPromptDisplayItem({ id: "prompt", text: "Steer", steering: true, createdAt: created_at });
  const thinking = item("thinking", Number.MAX_SAFE_INTEGER - 2);
  const next = item("next", Number.MAX_SAFE_INTEGER - 1);
  const ids = (items: DisplayItem[]) => anchorPromptTimeline(items, anchors).map(item => item.id);
  assert.deepEqual(ids([first, thinking, prompt]), ["turn", "thinking", "prompt"]);
  assert.deepEqual(ids([first, thinking, next, prompt]), ["turn", "thinking", "prompt", "next"]);
  assert.deepEqual(ids([first, { ...prompt, sequence: 2 }, thinking, next]), ["turn", "thinking", "prompt", "next"]);
  assert.deepEqual(ids([first, { ...prompt, sequence: 2 }, { ...thinking, sequence: 3 }, next]), ["turn", "thinking", "prompt", "next"]);
  anchors.set("prompt2", capturePromptTimelineAnchor(2, ["thinking", "next"], anchors));
  assert.deepEqual(anchors.get("prompt2")?.previews, ["next"]);
  assert.deepEqual(ids([first, { ...prompt, sequence: 2 }, thinking, next, item("prompt2", Number.MAX_SAFE_INTEGER, "user_message")]), ["turn", "thinking", "prompt", "next", "prompt2"]);
  // Paginated older history still belongs ahead of the live boundary.
  assert.deepEqual(ids([item("older", 0), first, { ...prompt, sequence: 2 }, thinking]), ["older", "turn", "thinking", "prompt"]);
});
