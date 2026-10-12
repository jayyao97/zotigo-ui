import { test } from "node:test";
import assert from "node:assert/strict";
import { DaemonClient } from "../src/core/client";

const connection = {
  id: "home",
  name: "Home",
  baseUrl: "https://home.test",
  token: "home-token",
};
test("selection translation uses the scoped public API and does not submit conversation messages", async () => {
  const calls: string[] = [];
  const client = new DaemonClient(connection, async (url, init) => {
    calls.push(url);
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer home-token",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "A selected passage",
      target_language: "zh-CN",
    });
    return Response.json({
      code: "ok",
      data: { text: "选中的片段", profile: "translation", model: "test" },
    });
  });
  assert.equal(
    (
      await client.translateSelection(
        "session/id",
        "A selected passage",
        "zh-CN",
      )
    ).text,
    "选中的片段",
  );
  assert.deepEqual(calls, [
    "https://home.test/sessions/session%2Fid/translate",
  ]);
});
test("translation validates size, reports unsupported daemons, and never retries", async () => {
  let calls = 0;
  const client = new DaemonClient(connection, async () => {
    calls++;
    return Response.json(
      { code: "not_found", message: "Not found" },
      { status: 404 },
    );
  });
  await assert.rejects(
    client.translateSelection("s", " ", "en"),
    /Select between/,
  );
  await assert.rejects(
    client.translateSelection("s", "😀".repeat(8001), "en"),
    /8,000/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    client.translateSelection("s", "😀".repeat(8000), "en"),
    /Update this daemon/,
  );
  assert.equal(calls, 1);
});
test("closing selection aborts its translation request", async () => {
  const client = new DaemonClient(
    connection,
    async (_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }),
  );
  const controller = new AbortController();
  const request = client.translateSelection(
    "s",
    "Translate this",
    "en",
    controller.signal,
  );
  controller.abort();
  await assert.rejects(request, /aborted/);
});

test("translation sends the settings profile only when explicitly configured", async () => {
  const bodies: unknown[] = [];
  const client = new DaemonClient(connection, async (_, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ code: "ok", data: { text: "Translated" } });
  });
  await client.translateSelection("s", "Excerpt", "en", undefined, "fast");
  await client.translateSelection("s", "Excerpt", "zh-CN");
  assert.deepEqual(bodies, [
    { text: "Excerpt", target_language: "en", profile: "fast" },
    { text: "Excerpt", target_language: "zh-CN" },
  ]);
});
