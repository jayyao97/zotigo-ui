import assert from "node:assert/strict";
import { test } from "node:test";

import { conversationAutoFollowAfterWheel } from "../shared/conversationScroll";

test("an upward wheel gesture releases conversation auto-follow immediately", () => {
  assert.equal(conversationAutoFollowAfterWheel(true, -1), false);
  assert.equal(conversationAutoFollowAfterWheel(false, -1), false);
});

test("downward and stationary wheel gestures do not re-enable auto-follow", () => {
  assert.equal(conversationAutoFollowAfterWheel(true, 1), true);
  assert.equal(conversationAutoFollowAfterWheel(false, 1), false);
  assert.equal(conversationAutoFollowAfterWheel(false, 0), false);
});
