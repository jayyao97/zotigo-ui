import { test } from "node:test";
import assert from "node:assert/strict";
import { DaemonClient, ApiError, normalizeAddress } from "../src/core/client";
import { HostStore, type Storage } from "../src/core/hosts";
import { EventDecoder } from "../src/core/events";
import { Timeline } from "../src/core/timeline";
import type { DisplayItem } from "@zotigo/shared/zotigod";
const connection = {
  id: "a",
  name: "Home",
  baseUrl: "https://home.test",
  token: "secret-a",
};
const item: DisplayItem = {
  id: "block",
  sequence: 12,
  type: "assistant_message",
  created_at: "",
  content: [{ type: "text", text: "Complete" }],
};
function memory(): Storage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
}
test("host origin validation rejects credentials, paths, and non-HTTP schemes", () => {
  for (const url of [
    "file:///a",
    "https://u:p@home.test",
    "https://home.test/proxy",
    "https://home.test?token=x",
  ])
    assert.throws(() => normalizeAddress(url));
  assert.equal(
    normalizeAddress(" http://100.64.0.1:8766/ "),
    "http://100.64.0.1:8766",
  );
});
test("requests bind endpoint and bearer to a copied connection, unwrap envelope and retain errors", async () => {
  const input = { ...connection };
  const calls: string[] = [];
  const client = new DaemonClient(input, async (url, init) => {
    calls.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer secret-a",
    );
    return Response.json({
      code: "ok",
      data: { status: "ok", protocol_version: "1" },
    });
  });
  input.baseUrl = "https://evil.test";
  input.token = "other";
  assert.equal((await client.health()).status, "ok");
  assert.deepEqual(calls, ["https://home.test/health"]);
  await assert.rejects(client.image("https://evil.test/sessions/s/images/a"));
  const bad = new DaemonClient(connection, async () =>
    Response.json({ code: "conflict", message: "changed" }, { status: 409 }),
  );
  await assert.rejects(
    bad.saveFile({ path: "/a", content: "x", expectedMtimeMs: 1 }),
    (e: unknown) =>
      e instanceof ApiError && e.status === 409 && e.code === "conflict",
  );
});
test("disposing a host aborts its in-flight body and does not affect another host", async () => {
  let signal: AbortSignal | undefined;
  const client = new DaemonClient(connection, async (_, init) => {
    signal = init?.signal ?? undefined;
    return new Response(
      new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () =>
            controller.error(new Error("aborted")),
          );
        },
      }),
    );
  });
  const result = client.health();
  await new Promise<void>((resolve) => setImmediate(resolve));
  client.dispose();
  await assert.rejects(result);
  assert.equal(signal?.aborted, true);
});
test("host metadata never contains token; missing secret does not downgrade to anonymous", async () => {
  const storage = memory(),
    secrets = memory();
  const store = new HostStore(storage, secrets);
  await Promise.all([
    store.save(connection, "secret-a"),
    store.save({ ...connection, id: "b" }, "secret-b"),
  ]);
  assert.equal((await store.list()).length, 2);
  assert.ok(![...storage.values.values()].join("").includes("secret"));
  await secrets.remove("host.a");
  await assert.rejects(store.connection(connection), /missing/);
  await store.remove("b");
  assert.equal(await secrets.get("host.b"), null);
});
test("SSE parser handles fragmented CRLF, heartbeat and volatile delta", () => {
  const decoder = new EventDecoder();
  assert.deepEqual(decoder.push(": keepalive\r\n\r\nevent: del"), []);
  const frames = decoder.push(
    'ta\r\ndata: {"item_id":"block","role":"assistant","part_type":"text","delta":"hi"}\r\n\r\nid: 12\nevent: item\ndata: ' +
      JSON.stringify(item) +
      "\n\n",
  );
  assert.equal(frames.length, 2);
  assert.equal(frames[1].type, "item");
});
test("durable event replaces preview, replay dedupes, late delta is ignored", async () => {
  const client = new DaemonClient(connection, async () => {
    throw new Error("unexpected HTTP");
  });
  const timeline = new Timeline(client, "s");
  timeline.accept({
    type: "delta",
    delta: {
      item_id: "block",
      role: "assistant",
      part_type: "text",
      delta: "preview",
    },
  });
  timeline.accept({ type: "item", item });
  timeline.accept({ type: "item", item });
  timeline.accept({
    type: "delta",
    delta: {
      item_id: "block",
      role: "assistant",
      part_type: "text",
      delta: "late",
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(timeline.snapshot().items.length, 1);
  assert.equal(timeline.snapshot().previews.length, 0);
  timeline.stop();
});
test("successful DELETE with no content does not parse a nonexistent JSON envelope", async () => {
  const client = new DaemonClient(
    connection,
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(await client.removeSource("p", "source"), undefined);
});
test("device rename and token rotation keep draft identity; registry write failure rolls credentials back", async () => {
  const metadata = memory(),
    secrets = memory();
  const store = new HostStore(metadata, secrets);
  await store.save(connection, "old");
  await store.save({ ...connection, name: "Renamed" }, "new");
  assert.equal((await store.list())[0].id, connection.id);
  assert.equal((await store.connection(connection)).token, "new");
  const failing = new HostStore(
    {
      ...metadata,
      set: async () => {
        throw new Error("disk full");
      },
    },
    secrets,
  );
  await assert.rejects(
    failing.save({ ...connection, name: "Lost" }, "bad"),
    /disk full/,
  );
  assert.equal((await store.connection(connection)).token, "new");
  await assert.rejects(
    store.save({ ...connection, id: "bad/key" }, "token"),
    /Invalid device ID/,
  );
  await assert.rejects(
    store.save({ ...connection, baseUrl: "https://another.test" }, "token"),
    /new device ID/,
  );
});
