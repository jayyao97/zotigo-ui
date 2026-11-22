import { test } from "node:test";
import assert from "node:assert/strict";
import { inputDeliveryOutcome } from "@zotigo/shared/inputDelivery";
import { DaemonClient } from "../src/core/client";
import { HostStore, type Storage } from "../src/core/hosts";

const ok = (data: unknown = {}) => Response.json({ code: "ok", data });

test("successful catalog changes notify listeners; reads, failures and other areas do not", async () => {
  const client = new DaemonClient({ id: "a", name: "Home", baseUrl: "https://home.test", token: "t" }, async (url, init) =>
    new URL(url).pathname === "/sessions/x/archive" && init?.method === "POST" && String(init.body).includes("fail")
      ? Response.json({ code: "bad", message: "no" }, { status: 400 })
      : ok(),
  );
  let changes = 0;
  const off = client.onCatalogChange(() => changes++);
  await client.request("/sessions/x/title", "PUT", { title: "t" });
  await client.request("/projects", "POST", { name: "p" });
  await client.request("/workspaces/w/archive", "POST");
  assert.equal(changes, 3);
  await client.request("/catalog/sessions");
  await client.request("/sessions/x/title-suggestion", "POST");
  await client.request("/sessions/x/approvals/a", "POST", {});
  await client.request("/files/save", "POST", {});
  await client.request("/channels/connections/c", "PUT", {});
  await assert.rejects(client.request("/sessions/x/archive", "POST", { fail: true }));
  assert.equal(changes, 3, "reads, failures and non-catalog changes are ignored");
  off();
  await client.request("/sessions/x/pinned", "PUT", {});
  assert.equal(changes, 3, "unsubscribed");
});

test("a send is restored for a new attempt only when it was definitely refused", () => {
  assert.equal(inputDeliveryOutcome(400, "invalid_request"), "rejected");
  assert.equal(inputDeliveryOutcome(409, "active_turn"), "rejected");
  // These may have been admitted: retry with the same ID.
  for (const [status, code] of [
    [409, "command_pending"],
    [409, "command_id_conflict"],
    [422, "input_failed"],
    [408, "timeout"],
    [500, "internal"],
    [503, undefined],
  ] as const)
    assert.equal(inputDeliveryOutcome(status, code), "unknown", `${status} ${code}`);
  assert.equal(inputDeliveryOutcome(undefined, undefined), "unknown", "no response at all");
});

test("the device store notifies after saving and removing", async () => {
  const memory = (): Storage => {
    const values = new Map<string, string>();
    return {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => void values.set(key, value),
      remove: async (key) => void values.delete(key),
    };
  };
  const store = new HostStore(memory(), memory());
  const seen: number[] = [];
  const off = store.subscribe(async () => seen.push((await store.list()).length));
  await store.save({ id: "a", name: "Home", baseUrl: "https://home.test" }, "t");
  await store.save({ id: "b", name: "Work", baseUrl: "https://work.test" }, "t");
  await store.remove("a");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, [1, 2, 1]);
  off();
});
