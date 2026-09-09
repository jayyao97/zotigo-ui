import assert from "node:assert/strict";
import test from "node:test";
import {
  completedUnreadSessionIds,
  parseUnreadSessionIds,
  selectedSessionToMarkRead,
  unreadSessionsStorageKey,
  workingSessionsStorageKey,
} from "../src/unreadSessions";

test("marks only background sessions that transition out of working", () => {
  assert.deepEqual(
    completedUnreadSessionIds(
      new Set(["selected", "background", "still-working"]),
      new Set(["still-working"]),
      "selected",
    ),
    ["background"],
  );
});

test("detects completion from a persisted working snapshot after restart", () => {
  const previousWorking = parseUnreadSessionIds('["completed-while-closed","deleted"]');
  assert.deepEqual(
    completedUnreadSessionIds(previousWorking, new Set(), null, new Set(["completed-while-closed"])),
    ["completed-while-closed"],
  );
});

test("marks a restored or newly selected session read only once per selection", () => {
  assert.equal(selectedSessionToMarkRead(null, "restored"), "restored");
  assert.equal(selectedSessionToMarkRead("restored", "restored"), null);
  assert.equal(selectedSessionToMarkRead("restored", "next"), "next");
  assert.equal(selectedSessionToMarkRead("restored", null), null);
});

test("parses persisted unread session ids defensively", () => {
  assert.deepEqual([...parseUnreadSessionIds('["one",1,"", "two"]')], ["one", "two"]);
  assert.deepEqual([...parseUnreadSessionIds("not-json")], []);
  assert.deepEqual([...parseUnreadSessionIds('{"one":true}')], []);
});

test("isolates persisted unread state by client scope", () => {
  assert.equal(unreadSessionsStorageKey("local"), "zotigo.unread-sessions.local");
  assert.notEqual(unreadSessionsStorageKey("local"), unreadSessionsStorageKey("dev"));
  assert.equal(workingSessionsStorageKey("local"), "zotigo.unread-sessions.working.local");
});
