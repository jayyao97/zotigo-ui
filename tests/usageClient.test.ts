import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import { getUsageActivity, setDaemonBaseUrl } from "../backend/zotigod";
import { getUsageSessions } from "../backend/usageService";
import { parseUsageSessionsQuery } from "../shared/usage";

let server: http.Server;
let missing = false;
const requests: string[] = [];
const totals = (total: number) => ({ total, input: total / 2, cache_read: total / 2, cache_write: 0, output: 0, cache_input: total, turns: 1 });
const session = (id: string, availability: string, title: string | null, archived = false) => ({
  runtime: { id, title: "", working_directory: "/w", state: "ended", approval_policy: "auto", created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", last_prompt: "prompt " + id },
  organization: { session_id: id, project_id: null, workspace_id: null, title, pinned_at: null, pinned_position: null, workspace_position: null, self_archived_at: archived ? "2026-11-20T00:00:00Z" : null, workspace_archived_at: null, revision: 1, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z" },
  availability,
});

before(async () => {
  server = http.createServer((request, response) => {
    requests.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    if (missing) {
      response.statusCode = 404;
      response.end(JSON.stringify({ code: "not_found", message: "not found" }));
      return;
    }
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname === "/usage/activity") {
      response.end(JSON.stringify({ code: "ok", data: {
        usage_query_version: 1, tracking_since: "2026-11-20T01:00:00Z", range: totals(10), all_time: totals(20),
        by_model: [{ model: "m", runtime: "zotigo", ...totals(10) }], days: [{ date: "2026-11-20", ...totals(10) }],
        peak_day: { date: "2026-11-20", total: 10 }, current_streak_days: 1, longest_streak_days: 2,
      } }));
      return;
    }
    if (url.pathname === "/usage/sessions") {
      response.end(JSON.stringify({ code: "ok", data: { usage_query_version: 1, next_cursor: "next", sessions: ["a", "b", "c"].map(id => ({
        session_id: id, models: ["m"], channel_turns: 0, last_completed_at: "2026-11-20T01:00:00Z", ...totals(4),
      })) } }));
      return;
    }
    if (url.pathname === "/catalog/sessions") {
      response.end(JSON.stringify({ code: "ok", data: { query_version: 1, sessions: [session("a", "ready", "Named"), session("b", "archived", null, true)] } }));
      return;
    }
    response.statusCode = 500;
    response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server address");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
});

after(() => new Promise<void>(resolve => server.close(() => resolve())));

test("usage activity parses the daemon response and sends the query", async () => {
  requests.length = 0;
  const result = await getUsageActivity({ timeZone: "Asia/Kathmandu", from: "2026-11-01", to: "2026-11-20", model: "m", channel: "only" });
  assert.equal(result.supported, true);
  assert.ok(result.supported);
  assert.equal(result.data.trackingSince, "2026-11-20T01:00:00Z");
  assert.deepEqual(result.data.range, { total: 10, input: 5, cacheRead: 5, cacheWrite: 0, output: 0, cacheInput: 10, turns: 1 });
  assert.equal(result.data.byModel[0].model, "m");
  assert.equal(result.data.days[0].date, "2026-11-20");
  assert.equal(result.data.longestStreakDays, 2);
  const query = new URL(requests[0], "http://localhost").searchParams;
  assert.equal(query.get("tz"), "Asia/Kathmandu");
  assert.equal(query.get("model"), "m");
  assert.equal(query.get("channel"), "only");
});

test("usage sessions resolve titles, including archived and deleted sessions", async () => {
  requests.length = 0;
  const result = await getUsageSessions({ timeZone: "UTC", from: "2026-11-20", to: "2026-11-20", limit: 3 });
  assert.ok(result.supported);
  assert.equal(result.data.nextCursor, "next");
  assert.deepEqual(result.data.sessions.map(row => [row.sessionId, row.title, row.availability]), [
    ["a", "Named", "available"], ["b", "prompt b", "archived"], ["c", "", "deleted"],
  ]);
  const catalog = new URL(requests.find(path => path.startsWith("/catalog/sessions"))!, "http://localhost").searchParams;
  assert.equal(catalog.get("ids"), "a,b,c");
  assert.equal(catalog.get("include_archived"), "true");
});

test("an older daemon reports usage as unsupported", async () => {
  missing = true;
  try {
    assert.deepEqual(await getUsageActivity({ timeZone: "UTC", from: "2026-11-20", to: "2026-11-20" }), { supported: false });
    assert.deepEqual(await getUsageSessions({ timeZone: "UTC", from: "2026-11-20", to: "2026-11-20" }), { supported: false });
  } finally {
    missing = false;
  }
});

test("usage queries from the renderer are validated", () => {
  assert.throws(() => parseUsageSessionsQuery({ timeZone: "UTC", from: "2026/11/20", to: "2026-11-20" }));
  assert.throws(() => parseUsageSessionsQuery({ timeZone: "UTC", from: "2026-11-20", to: "2026-11-20", channel: "some" }));
  assert.throws(() => parseUsageSessionsQuery({ timeZone: "UTC", from: "2026-11-20", to: "2026-11-20", limit: 500 }));
  assert.deepEqual(parseUsageSessionsQuery({ timeZone: "UTC", from: "2026-11-20", to: "2026-11-20", limit: 20, cursor: "" }), { timeZone: "UTC", from: "2026-11-20", to: "2026-11-20", limit: 20 });
});
