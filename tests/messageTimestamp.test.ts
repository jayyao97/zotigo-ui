import assert from "node:assert/strict";
import test from "node:test";
import { messageTimestamp } from "../src/conversation/messageTimestamp";

test("message times distinguish recent weekdays from old dates and reject missing dates", () => {
  const now = new Date("2026-10-15T18:00:00Z");
  assert.equal(messageTimestamp(undefined), null);
  assert.equal(messageTimestamp("not a date"), null);
  const recent = messageTimestamp("2026-10-15T10:12:00Z", now, "en-US")!;
  assert.match(recent.label, /Thu/);
  assert.match(recent.full, /2026/);
  const old = messageTimestamp("2025-10-15T10:12:00Z", now, "en-US")!;
  assert.match(old.label, /2025/);
});
