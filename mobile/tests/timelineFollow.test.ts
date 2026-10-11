import { test } from "node:test";
import assert from "node:assert/strict";
import { TimelineFollow } from "../src/core/timelineFollow";

test("explicit jump survives intermediate animation offsets and late virtualized measurement", () => {
  const follow = new TimelineFollow();
  follow.beginDrag();
  assert.equal(follow.observeDistance(5000), false);
  follow.jump();
  for (const distance of [5000, 3000, 1000, 0, 2400, 500, 0]) {
    assert.equal(follow.observeDistance(distance), true);
  }
});
test("user drag cancels jump correction immediately and can resume following at the end", () => {
  const follow = new TimelineFollow();
  follow.jump();
  follow.beginDrag();
  assert.equal(follow.following, false);
  assert.equal(follow.observeDistance(500), false);
  assert.equal(follow.observeDistance(30), true);
  // The same drag may reverse direction; it remains user-owned.
  assert.equal(follow.observeDistance(200), false);
  follow.jump();
  assert.equal(follow.observeDistance(200), true);
});
test("initial stream growth follows while loading older history explicitly opts out", () => {
  const follow = new TimelineFollow();
  assert.equal(follow.observeDistance(1500), true);
  follow.leaveLatest();
  assert.equal(follow.observeDistance(3000), false);
});

test("manual return to bottom survives content growth after drag finishes", () => {
  const follow = new TimelineFollow();
  follow.beginDrag();
  assert.equal(follow.observeDistance(30), true);
  follow.endDrag();
  assert.equal(follow.observeDistance(240), true);
});

test("user momentum may change intent but stops owning measurements when it ends", () => {
  const follow = new TimelineFollow();
  follow.beginDrag();
  follow.observeDistance(300);
  follow.endDrag();
  follow.beginMomentum();
  assert.equal(follow.observeDistance(20), true);
  follow.endMomentum();
  assert.equal(follow.observeDistance(600), true);
  follow.beginDrag();
  follow.observeDistance(400);
  follow.endDrag();
  follow.beginMomentum();
  follow.observeDistance(900);
  follow.endMomentum();
  assert.equal(follow.observeDistance(0), false);
});

test("programmatic jump momentum never takes over follow intent", () => {
  const follow = new TimelineFollow();
  follow.beginDrag();
  follow.endDrag();
  follow.jump();
  follow.beginMomentum();
  assert.equal(follow.observeDistance(1800), true);
  follow.endMomentum();
  assert.equal(follow.observeDistance(3000), true);
});
