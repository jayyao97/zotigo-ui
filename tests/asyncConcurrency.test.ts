import assert from "node:assert/strict";
import test from "node:test";

import { mapWithConcurrency } from "../shared/asyncConcurrency";

test("maps in input order without exceeding the concurrency limit", async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
  assert.equal(maximumActive, 2);
});

test("stops queued work on failure and waits for in-flight tasks", async () => {
  const started: number[] = [];
  let releaseInFlight!: () => void;
  const inFlight = new Promise<void>((resolve) => {
    releaseInFlight = resolve;
  });
  let settled = false;
  const result = mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
    started.push(value);
    if (value === 1) throw new Error("failed");
    await inFlight;
    return value;
  });
  void result.finally(() => {
    settled = true;
  }).catch(() => undefined);

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(started, [1, 2]);
  releaseInFlight();
  await assert.rejects(result, /failed/);
  assert.equal(settled, true);
  assert.deepEqual(started, [1, 2]);
});

test("preserves nullish rejection reasons", async () => {
  await assert.rejects(
    mapWithConcurrency([1], 1, async () => Promise.reject(undefined)),
    (error: unknown) => error === undefined,
  );
  let releaseLater!: () => void;
  const later = new Promise<void>((resolve) => {
    releaseLater = resolve;
  });
  const competingFailures = mapWithConcurrency([1, 2], 2, async (value) => {
    if (value === 1) return Promise.reject(null);
    await later;
    throw new Error("later");
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseLater();
  await assert.rejects(
    competingFailures,
    (error: unknown) => error === null,
  );
});

test("rejects invalid concurrency instead of returning sparse results", async () => {
  await assert.rejects(
    mapWithConcurrency([1], 0, async (value) => value),
    /positive integer/,
  );
});
