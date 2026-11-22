import { test } from "node:test";
import assert from "node:assert/strict";
import type { UsageResult } from "@zotigo/shared/usage";
import { UsageCache, UsageQuery, usagePollMilliseconds, type UsageState } from "../src/core/usageQuery";

const result = (data: number): UsageResult<number> => ({ supported: true, data });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A loader whose responses the test settles by hand, recording each request. */
function loader() {
  const pending: Array<{ resolve: (value: UsageResult<number>) => void; reject: (error: Error) => void }> = [];
  return {
    load: () => new Promise<UsageResult<number>>((resolve, reject) => pending.push({ resolve, reject })),
    pending,
  };
}

function harness(now = { value: Date.parse("2026-11-22T12:00:00Z") }) {
  const cache = new UsageCache(64, () => now.value);
  const states: UsageState<number>[] = [];
  const make = (key: string) =>
    new UsageQuery<number>(cache, key, (state) => states.push(state), (error) => String((error as Error).message));
  return { cache, states, make, now };
}

test("opening the page sends each query once", async () => {
  const h = harness();
  const l = loader();
  const query = h.make("k");
  // The screen's order: the key effect, then focus.
  query.load("k", l.load);
  query.focus("k", l.load);
  assert.equal(l.pending.length, 1);
  l.pending[0].resolve(result(1));
  await tick();
  assert.deepEqual(query.state, { result: result(1), error: "", loading: false });
});

test("changing a filter while focused sends one request for the new key", async () => {
  const h = harness();
  const l = loader();
  const query = h.make("a");
  query.load("a", l.load);
  query.focus("a", l.load);
  l.pending[0].resolve(result(1));
  await tick();
  // Focus effects re-run for the new key after the load effect.
  query.blur();
  query.load("b", l.load);
  query.focus("b", l.load);
  assert.equal(l.pending.length, 2);
});

test("a response that lands while the page is away is shown on return without a new request", async () => {
  const h = harness();
  const l = loader();
  const query = h.make("k");
  query.load("k", l.load);
  query.focus("k", l.load);
  query.blur(); // opened a conversation from the ranking
  l.pending[0].resolve(result(7));
  await tick();
  assert.equal(query.state.loading, true, "nothing is applied while away");
  query.focus("k", l.load);
  assert.deepEqual(query.state, { result: result(7), error: "", loading: false });
  assert.equal(l.pending.length, 1, "the fresh result is not fetched again");
});

test("an error that lands while away is shown on return, then a stale result refreshes", async () => {
  const h = harness();
  const l = loader();
  const query = h.make("k");
  query.load("k", l.load);
  query.focus("k", l.load);
  query.blur();
  l.pending[0].reject(new Error("offline"));
  await tick();
  query.focus("k", l.load);
  assert.equal(query.state.error, "offline");
  assert.equal(query.state.loading, false);
  assert.equal(l.pending.length, 2, "with nothing cached the return retries once");
});

test("only the newest request changes the state", async () => {
  const h = harness();
  const l = loader();
  const query = h.make("a");
  query.load("a", l.load);
  query.focus("a", l.load);
  query.load("b", l.load);
  l.pending[1].resolve(result(2));
  l.pending[0].resolve(result(1));
  await tick();
  assert.deepEqual(query.state.result, result(2));
  assert.deepEqual(h.cache.get("a")?.value, result(1), "the older response is still cached for its own key");
});

test("polling skips a key whose request is still out, and return-to-app polls only when stale", async () => {
  const h = harness();
  const l = loader();
  const query = h.make("k");
  query.load("k", l.load);
  query.focus("k", l.load);
  query.poll("k", l.load);
  assert.equal(l.pending.length, 1);
  l.pending[0].resolve(result(1));
  await tick();
  query.poll("k", l.load, true);
  assert.equal(l.pending.length, 1, "a fresh result is kept when the app becomes active");
  h.now.value += usagePollMilliseconds;
  query.poll("k", l.load, true);
  assert.equal(l.pending.length, 2);
});

test("a cached key renders at once and refreshes only when stale", () => {
  const h = harness();
  h.cache.set("k", result(3));
  const l = loader();
  const query = h.make("k");
  assert.deepEqual(query.state.result, result(3));
  query.load("k", l.load);
  query.focus("k", l.load);
  assert.equal(l.pending.length, 1);
});
