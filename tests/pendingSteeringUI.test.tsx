import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { SessionTimeline } from "../src/conversation/ConversationTimeline";
import { acknowledgeOptimisticPrompt, mergeDisplayItems, optimisticPromptDisplayItem, reconcileOptimisticSteering } from "../shared/sessionDisplay";
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
