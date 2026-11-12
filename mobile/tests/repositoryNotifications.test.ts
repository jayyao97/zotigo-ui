import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, DaemonClient } from "../src/core/client";
const host = { id: "home", name: "Home", baseUrl: "https://home.test", token: "fixture" };

test("repository linking and branch reads use public host-scoped endpoints and preserve imported refs", async () => {
  const calls: { url: string; method?: string; body: unknown }[] = [];
  const branch = { name: "local/topic", ref: "refs/imported/source/local/topic", kind: "imported" };
  const client = new DaemonClient(host, async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ code: "ok", data: url.endsWith("/branches") ? { branches: [branch] } : url.endsWith("/repositories") && init?.method === "GET" ? { repositories: [] } : {} });
  });
  await client.repositories();
  await client.createRepository("git@example.test:org/repo.git");
  await client.linkRepository("project/a", "repository-1");
  assert.deepEqual(await client.repositoryBranches("project/a", "source/b"), [branch]);
  await client.repositoryBranches("project/a", "source/b", true);
  assert.equal(calls[2].url, "https://home.test/projects/project%2Fa/sources");
  assert.deepEqual(calls[2].body, { repository_id: "repository-1" });
  assert.equal(calls[3].url, "https://home.test/projects/project%2Fa/sources/source%2Fb/branches");
  assert.equal(calls[3].method, "GET");
  assert.equal(calls[4].method, "POST");
});

test("notification history and cancellation encode IDs; old daemons are unsupported, authentication errors remain errors", async () => {
  const calls: string[] = [];
  let status = 200;
  const client = new DaemonClient(host, async (url, init) => {
    calls.push(`${init?.method} ${url}`);
    if (status !== 200) return Response.json({ code: "error", message: "failure" }, { status });
    return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ code: "ok", data: { items: [{ id: "a", title: "Build", on_fire: "Report", expires_at: "2099-01-01T00:00:00Z", state: "fired" }] } });
  });
  assert.equal((await client.listCompletionTriggers("s/a"))?.[0].state, "fired");
  await client.cancelCompletionTrigger("s/a", "trigger/b");
  assert.match(calls[0], /s%2Fa\/completion-triggers\?include_history=true$/);
  assert.match(calls[1], /^DELETE .*s%2Fa\/completion-triggers\/trigger%2Fb$/);
  for (status of [404, 405]) assert.equal(await client.listCompletionTriggers("s"), null);
  status = 401;
  await assert.rejects(client.listCompletionTriggers("s"), error => error instanceof ApiError && error.status === 401);
});

 test("unknown notification states and branch kinds fail at the transport boundary", async () => {
   const client = new DaemonClient(host, async url => Response.json({ code: "ok", data: url.includes("completion-triggers") ? { items: [{ id: "a", title: "Build", on_fire: "Report", expires_at: "2099-01-01", state: "unknown" }] } : { branches: [{ name: "main", ref: "main", kind: "unknown" }] } }));
   await assert.rejects(client.listCompletionTriggers("s"), /Invalid completion triggers/);
   await assert.rejects(client.repositoryBranches("p", "s"), /Invalid repository branches/);
 });
