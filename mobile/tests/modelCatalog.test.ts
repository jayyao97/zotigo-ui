import test from "node:test";
import assert from "node:assert/strict";
import { DaemonClient } from "../src/core/client";
const json = (data: unknown) => Response.json({ code: "ok", data });

test("model catalog automatically prepares empty discovery, caches per connection and refreshes explicitly", async () => {
  let prepares = 0;
  const connection = {
    id: "home",
    name: "Home",
    baseUrl: "https://home.test",
    token: "",
  };
  const fetcher = async (url: string) =>
    json(
      url.endsWith("/prepare")
        ? { id: "codex", models: [{ id: `model-${++prepares}` }] }
        : { default_agent: "codex", agents: [{ id: "codex", models: [] }] },
    );
  const client = new DaemonClient(connection, fetcher);
  const [a, b] = await Promise.all([
    client.modelCatalog(),
    client.modelCatalog(),
  ]);
  assert.equal(a.agents[0].models?.[0].id, "model-1");
  assert.equal(b, a);
  assert.equal(
    (await client.modelCatalog()).agents[0].models?.[0].id,
    "model-1",
  );
  assert.equal(
    (await client.modelCatalog(true)).agents[0].models?.[0].id,
    "model-2",
  );
  const other = new DaemonClient({ ...connection, id: "work" }, fetcher);
  assert.equal(
    (await other.modelCatalog()).agents[0].models?.[0].id,
    "model-3",
  );
});
test("a failed model read can be retried without retaining a rejected cache", async () => {
  let fail = true;
  const client = new DaemonClient(
    { id: "h", name: "H", baseUrl: "https://h.test", token: "" },
    async () => {
      if (fail) throw new Error("offline");
      return json({
        default_agent: "zotigo",
        agents: [{ id: "zotigo" }],
      });
    },
  );
  await assert.rejects(client.modelCatalog(), /offline/);
  fail = false;
  assert.equal((await client.modelCatalog()).default_agent, "zotigo");
});
