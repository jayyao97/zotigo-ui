import { test } from "node:test";
import assert from "node:assert/strict";
import { DaemonClient } from "../src/core/client";
import { usageActivity, usageSessions } from "../src/core/usage";

const totals = (total: number) => ({ total, input: total / 2, cache_read: total / 2, cache_write: 0, output: 0, cache_input: total, turns: 1 });
const ok = (data: unknown) => Response.json({ code: "ok", data });

function daemon(routes: (url: URL) => Response) {
  const calls: URL[] = [];
  const client = new DaemonClient({ id: "a", name: "Home", baseUrl: "https://home.test", token: "t" }, async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    return routes(parsed);
  });
  return { request: client.request.bind(client), calls };
}

test("usage activity is parsed from the daemon response with the query in the URL", async () => {
  const { request, calls } = daemon(() => ok({
    usage_query_version: 1, tracking_since: "2026-11-20T01:00:00Z", range: totals(10), all_time: totals(20),
    by_model: [{ model: "m", runtime: "codex", ...totals(10) }], days: [{ date: "2026-11-20", ...totals(10) }],
    peak_day: { date: "2026-11-20", total: 10 }, current_streak_days: 1, longest_streak_days: 2,
  }));
  const result = await usageActivity(request, { timeZone: "Asia/Kathmandu", from: "2026-11-01", to: "2026-11-20", model: "m", channel: "only" });
  assert.ok(result.supported);
  assert.deepEqual(result.data.range, { total: 10, input: 5, cacheRead: 5, cacheWrite: 0, output: 0, cacheInput: 10, turns: 1 });
  assert.equal(result.data.byModel[0].runtime, "codex");
  assert.equal(result.data.peakDay?.date, "2026-11-20");
  assert.equal(calls[0].pathname, "/usage/activity");
  assert.equal(calls[0].searchParams.get("tz"), "Asia/Kathmandu");
  assert.equal(calls[0].searchParams.get("channel"), "only");
});

test("ranked sessions get titles and availability from the catalog, and unknown IDs count as deleted", async () => {
  const session = (id: string, availability: string, title: string | null) => ({
    runtime: { id, last_prompt: `prompt  ${id}` }, organization: { session_id: id, title }, availability,
  });
  const { request, calls } = daemon((url) => url.pathname === "/usage/sessions"
    ? ok({ usage_query_version: 1, next_cursor: "next", sessions: ["a", "b", "c"].map((id) => ({ session_id: id, models: ["m"], channel_turns: 0, last_completed_at: "2026-11-20T01:00:00Z", ...totals(4) })) })
    : ok({ query_version: 1, sessions: [session("a", "ready", "Named"), session("b", "archived", null)] }));
  const result = await usageSessions(request, { timeZone: "UTC", from: "2026-11-20", to: "2026-11-20", limit: 3 });
  assert.ok(result.supported);
  assert.equal(result.data.nextCursor, "next");
  assert.deepEqual(result.data.sessions.map((row) => [row.sessionId, row.title, row.availability]), [
    ["a", "Named", "available"], ["b", "prompt b", "archived"], ["c", "", "deleted"],
  ]);
  const catalog = calls.find((url) => url.pathname === "/catalog/sessions")!;
  assert.equal(catalog.searchParams.get("ids"), "a,b,c");
  assert.equal(catalog.searchParams.get("include_archived"), "true");
});

test("a daemon without usage endpoints is reported as unsupported, not as an error", async () => {
  const missing = daemon(() => Response.json({ code: "not_found", message: "not found" }, { status: 404 }));
  assert.deepEqual(await usageActivity(missing.request, { timeZone: "UTC", from: "2026-11-20", to: "2026-11-20" }), { supported: false });
  assert.deepEqual(await usageSessions(missing.request, { timeZone: "UTC", from: "2026-11-20", to: "2026-11-20" }), { supported: false });
  const older = daemon(() => ok({ usage_query_version: 2 }));
  assert.deepEqual(await usageActivity(older.request, { timeZone: "UTC", from: "2026-11-20", to: "2026-11-20" }), { supported: false });
  const broken = daemon(() => Response.json({ code: "internal", message: "boom" }, { status: 500 }));
  await assert.rejects(usageActivity(broken.request, { timeZone: "UTC", from: "2026-11-20", to: "2026-11-20" }), /boom/);
});
