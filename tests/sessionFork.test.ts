import assert from "node:assert/strict";
import test from "node:test";
import { createForkRequestId, sessionTurnActions } from "../shared/sessionFork";
import type { DisplayItem, DisplayItemType } from "../shared/zotigod";

test("fork request IDs work on HTTP without randomUUID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  const browserCrypto = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: browserCrypto });
  try {
    const ids = Array.from({ length: 100 }, () => createForkRequestId());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^fork-[0-9a-f]{32}$/);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});

function item(sequence: number, type: DisplayItemType, turnId?: string, text?: string): DisplayItem {
  return { id: String(sequence), sequence, type, created_at: new Date(0).toISOString(),
    turn: turnId ? { id: turnId } : undefined, content: text ? [{ type: "text", text }] : undefined };
}

test("one footer per completed turn, latest is persistent and active is disabled", () => {
  const actions = sessionTurnActions([
    item(1, "turn_started", "a"), item(2, "assistant_message", "a", "First"),
    item(3, "assistant_message", "a", "Second"), item(4, "turn_completed", "a"),
    item(5, "user_message"), item(6, "turn_started", "b"), item(7, "assistant_message", "b", "Working"),
  ]);
  assert.equal(actions.size, 2);
  assert.deepEqual(actions.get("3"), { turnId: "a", completed: true, latest: false, text: "First\n\nSecond" });
  assert.deepEqual(actions.get("7"), { turnId: "b", completed: false, latest: true, text: "Working" });
});

test("synced Codex user message does not erase turn boundary; hidden tool-only message does not steal footer", () => {
  const actions = sessionTurnActions([
    item(1, "turn_started", "a"), item(2, "user_message", "a", "question"),
    item(3, "assistant_message", "a", "Answer"), item(4, "assistant_message", "a"), item(5, "turn_completed", "a"),
  ]);
  assert.deepEqual(actions.get("3"), { turnId: "a", completed: true, latest: true, text: "Answer" });
});

test("failed, incomplete and paginated turns cannot be forked", () => {
  assert.equal(sessionTurnActions([item(1, "assistant_message", "a", "Partial"), item(2, "turn_completed", "a")]).size, 0);
  const actions = sessionTurnActions([item(1, "turn_started", "a"), item(2, "assistant_message", "a", "Partial"), item(3, "turn_failed", "a")]);
  assert.equal(actions.get("2")?.completed, false);
});
