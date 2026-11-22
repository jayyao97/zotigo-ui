import test from "node:test";
import assert from "node:assert/strict";
import {
  HistoryPaginationGesture,
  TimelineScrollMetrics,
  retainExpandedTimelineGroups,
} from "../src/core/timelineScroll";

test("a prepend's synthetic scroll events cannot cascade through every older page", () => {
  const pagination = new HistoryPaginationGesture();
  assert.equal(pagination.consume(false, 0, true), false);
  pagination.arm();
  assert.equal(pagination.consume(false, 200, true), false);
  assert.equal(pagination.consume(false, 40, true), true);
  for (const offset of [0, 20, 60, 0])
    assert.equal(pagination.consume(false, offset, true), false);
  pagination.arm();
  assert.equal(pagination.consume(false, 30, true), true);
});
test("gestures while history is loading do not queue another page after layout settles", () => {
  const pagination = new HistoryPaginationGesture();
  pagination.arm();
  assert.equal(pagination.consume(false, 0, false), false);
  assert.equal(pagination.consume(false, 0, true), false);
  pagination.arm();
  pagination.cancel();
  assert.equal(pagination.consume(false, 0, true), false);
});
test("bottom corrections use measured height and do not repeat at an unchanged target", () => {
  const metrics = new TimelineScrollMetrics();
  metrics.contentHeight = 1200;
  assert.equal(metrics.correction(), undefined);
  metrics.viewportHeight = 600;
  assert.equal(metrics.correction(), 600);
  assert.equal(metrics.correction(), undefined);
  metrics.offset = 600;
  assert.equal(metrics.correction(), undefined);
  metrics.contentHeight = 1300;
  assert.equal(metrics.correction(), 700);
  metrics.offset = 699.5;
  assert.equal(metrics.correction(), undefined);
});
test("a new explicit jump may target the same bottom after a user scrolls away", () => {
  const metrics = new TimelineScrollMetrics();
  metrics.contentHeight = 1200;
  metrics.viewportHeight = 600;
  assert.equal(metrics.correction(), 600);
  metrics.offset = 200;
  metrics.resetCorrection();
  assert.equal(metrics.correction(), 600);
});

test("viewport changes keep the tail visible without needing new content", () => {
  const metrics = new TimelineScrollMetrics();
  metrics.contentHeight = 1200;
  metrics.viewportHeight = 600;
  metrics.offset = 600;
  assert.equal(metrics.correction(), undefined);
  metrics.viewportHeight = 400;
  assert.equal(metrics.correction(), 800);
  assert.equal(metrics.correction(), undefined);
  metrics.offset = 800;
  metrics.viewportHeight = 600;
  assert.equal(metrics.correction(), 600);
});

test("native bottom anchoring does not chase estimated heights as rows mount", () => {
  const metrics = new TimelineScrollMetrics(true);
  metrics.viewportHeight = 600;
  for (const height of [900, 8000, 7200, 14000, 11000]) {
    metrics.contentHeight = height;
    assert.equal(metrics.correction(), undefined);
  }
  metrics.offset = 200;
  assert.equal(metrics.correction(), 0);
  metrics.offset = 0;
  metrics.viewportHeight = 300;
  assert.equal(metrics.correction(), undefined);
});

test("reading an expanded activity keeps its rows present when the default collapses", () => {
  const rows = [
    { kind: "activity", key: "tools:1", open: true },
    { kind: "item", key: "tool-result" },
    { kind: "activity", key: "thinking:2", open: false },
  ];
  const retained = retainExpandedTimelineGroups(rows, {});
  assert.equal(retained["tools:1"] ?? false, true);
  assert.equal(retained["thinking:2"], undefined);
  // A subsequent explicit collapse is preserved on the next drag.
  const collapsed = { ...retained, "tools:1": false };
  assert.equal(retainExpandedTimelineGroups(rows, collapsed), collapsed);
});
