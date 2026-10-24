import assert from "node:assert/strict";
import test from "node:test";
import { retainSessionContextUsage } from "../src/sessionContextCache";
import type { ZotigoSession } from "../shared/zotigod";
const session: ZotigoSession = { id: "a", state: "ended", live: false, working: false, created_at: "", profile: "p", agent: "zotigo", model: "m" };
const known = { ...session, context_usage: { tokens: 42, window: 100 } };
test("list refresh preserves per-session usage and marks it cached", () => {
  const result = retainSessionContextUsage([known], [session, { ...session, id: "b" }]);
  assert.deepEqual(result[0].context_usage, { tokens: 42, window: 100, cached: true });
  assert.equal(result[1].context_usage, undefined);
  assert.deepEqual(retainSessionContextUsage([], [session]), [session]);
});
test("authoritative detail replaces or clears cached usage", () => {
  assert.equal(retainSessionContextUsage([known], [session], "a")[0].context_usage, undefined);
  const fresh = { ...session, context_usage: { tokens: 2, window: 100 } };
  assert.deepEqual(retainSessionContextUsage([known], [fresh], "a"), [fresh]);
});
test("changed runtime settings invalidate retained usage", () => {
  for (const change of [{ profile: "other" }, { model: "other" }, { agent: "codex" as const }, { reasoning_effort: "high" }]) {
    assert.equal(retainSessionContextUsage([known], [{ ...session, ...change }])[0].context_usage, undefined);
  }
});
