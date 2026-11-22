import assert from "node:assert/strict";
import { test } from "node:test";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { historyBackfillCursor } from "../src/core/historyBackfill";

const at = new Date(0).toISOString();
const assistant = (id: string, sequence: number): DisplayItem => ({
  id, sequence, type: "assistant_message", role: "assistant", content: [{ type: "text", text: "answer" }], created_at: at,
});

// Moved from tests/sessionDisplay.test.ts when master dropped the shared helper.
test("history backfill starts at the latest page only when cached history misses a turn start", () => {
  const previousTurn: DisplayItem = { id: "started-previous", sequence: 1, type: "turn_started", turn: { id: "turn-previous" }, created_at: at };
  const currentAnswer = { ...assistant("answer-current", 500), turn: { id: "turn-current" } };
  assert.equal(historyBackfillCursor([], null, [currentAnswer], "450"), "450");
  assert.equal(historyBackfillCursor([previousTurn], "1", [currentAnswer], "450"), "450");

  const currentStart: DisplayItem = { id: "started-current", sequence: 450, type: "turn_started", turn: { id: "turn-current" }, created_at: at };
  assert.equal(historyBackfillCursor([previousTurn], "1", [currentStart, currentAnswer], "450"), "450");
  const adjacentPreviousTurn = { ...previousTurn, sequence: 449 };
  assert.equal(historyBackfillCursor([adjacentPreviousTurn, currentStart], "1", [currentStart, currentAnswer], "450"), "1");
  assert.equal(historyBackfillCursor([previousTurn, currentStart], "1", [currentStart, currentAnswer], "450"), "1");
});
