import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { translateSelection } from "../backend/zotigod";
import { withConnection } from "../backend/hosts";
import { createClientApi } from "../shared/clientApi";

test("translation forwards the selected profile and preserves actual model metadata and provider errors", async () => {
  const requests: unknown[] = [];
  const daemon = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(requests.length === 3 ? 502 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(requests.length === 3
      ? { code: "provider_error", message: "translation provider rate limit reached (profile: fast; model: actual-model)" }
      : { code: "ok", data: requests.length === 1 ? { text: "你好", profile: "fast", model: "actual-model" } : { text: "hello" } }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  try {
    await withConnection({ id: "translation", name: "Translation", baseUrl: `http://127.0.0.1:${address.port}`, token: "" }, async () => {
      assert.deepEqual(await translateSelection("session", "hello", "zh-CN", "fast"), { text: "你好", profile: "fast", model: "actual-model" });
      assert.deepEqual(await translateSelection("session", "你好", "en"), { text: "hello", profile: undefined, model: undefined });
      await assert.rejects(translateSelection("session", "hello", "en", "fast"), /rate limit reached.*actual-model/);
    });
    assert.deepEqual(requests[0], { text: "hello", target_language: "zh-CN", profile: "fast" });
    assert.deepEqual(requests[1], { text: "你好", target_language: "en" });
  } finally { daemon.close(); await once(daemon, "close"); }
});

test("shared Desktop/Web client carries the optional translation profile", async () => {
  const calls: unknown[][] = [];
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => { calls.push([channel, ...args]); return { text: "done", profile: "fast", model: "actual-model" } as T; },
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  });
  assert.equal((await api.translateSelection("s", "text", "en", "fast")).model, "actual-model");
  await api.translateSelection("s", "text", "en");
  assert.deepEqual(calls, [["sessions:translate", "s", "text", "en", "fast"], ["sessions:translate", "s", "text", "en"]]);
});
