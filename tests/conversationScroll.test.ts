import assert from "node:assert/strict";
import { test } from "node:test";

import {
  conversationAutoFollowAfterScroll,
  conversationAutoFollowAfterWheel,
  conversationScrollIntentForKey,
  conversationShouldLoadOlder,
} from "../shared/conversationScroll";

test("an upward wheel gesture releases conversation auto-follow immediately", () => {
  assert.equal(conversationAutoFollowAfterWheel(true, -1), false);
  assert.equal(conversationAutoFollowAfterWheel(false, -1), false);
});

test("downward and stationary wheel gestures do not re-enable auto-follow", () => {
  assert.equal(conversationAutoFollowAfterWheel(true, 1), true);
  assert.equal(conversationAutoFollowAfterWheel(false, 1), false);
  assert.equal(conversationAutoFollowAfterWheel(false, 0), false);
});

test("layout-driven scroll events do not release auto-follow", () => {
  assert.equal(conversationAutoFollowAfterScroll(true, false, null), true);
  assert.equal(conversationAutoFollowAfterScroll(false, false, null), false);
  assert.equal(conversationAutoFollowAfterScroll(false, true, null), false);
});

test("an upward gesture stays released through its following scroll event", () => {
  const released = conversationAutoFollowAfterWheel(true, -1);
  assert.equal(conversationAutoFollowAfterScroll(released, true, "up"), false);
  assert.equal(conversationAutoFollowAfterScroll(released, false, "up"), false);
});

test("manual downward scrolling restores auto-follow only at the bottom", () => {
  assert.equal(conversationAutoFollowAfterScroll(false, false, "down"), false);
  assert.equal(conversationAutoFollowAfterScroll(false, true, "down"), true);
});

test("keyboard scrolling records the same explicit direction as pointer gestures", () => {
  assert.equal(conversationScrollIntentForKey("ArrowUp"), "up");
  assert.equal(conversationScrollIntentForKey("PageUp"), "up");
  assert.equal(conversationScrollIntentForKey("Home"), "up");
  assert.equal(conversationScrollIntentForKey(" ", true), "up");
  assert.equal(conversationScrollIntentForKey("ArrowDown"), "down");
  assert.equal(conversationScrollIntentForKey("PageDown"), "down");
  assert.equal(conversationScrollIntentForKey("End"), "down");
  assert.equal(conversationScrollIntentForKey(" "), "down");
  assert.equal(conversationScrollIntentForKey("Enter"), null);
});

test("older history loads only after the user releases auto-follow", () => {
  assert.equal(conversationShouldLoadOlder(true, 0), false);
  assert.equal(conversationShouldLoadOlder(false, 0), true);
  assert.equal(conversationShouldLoadOlder(false, 80), true);
  assert.equal(conversationShouldLoadOlder(false, 81), false);
});
