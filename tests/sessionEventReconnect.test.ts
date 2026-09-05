import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSessionEventReconnectDelayMs,
  sessionEventReconnectPlan,
  stableSessionEventConnectionMs,
} from "../shared/sessionEventReconnect";

test("backs off repeated successful handshakes that immediately reach EOF", () => {
  const first = sessionEventReconnectPlan(initialSessionEventReconnectDelayMs, {
    receivedEvent: false,
    connectedDurationMs: 1,
  });
  const second = sessionEventReconnectPlan(first.nextDelayMs, {
    receivedEvent: false,
    connectedDurationMs: 1,
  });
  assert.deepEqual([first.delayMs, second.delayMs, second.nextDelayMs], [500, 1000, 2000]);
});

test("resets retry delay only after useful or stable connections", () => {
  assert.equal(sessionEventReconnectPlan(10_000, {
    receivedEvent: true,
    connectedDurationMs: 1,
  }).delayMs, 500);
  assert.equal(sessionEventReconnectPlan(10_000, {
    receivedEvent: false,
    connectedDurationMs: stableSessionEventConnectionMs,
  }).delayMs, 500);
});
