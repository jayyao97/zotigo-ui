import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import { getDaemonConfig, health, setDaemonBaseUrl } from "../backend/zotigod";

const initialBaseUrl = getDaemonConfig().baseUrl;
let server: http.Server;
let healthData: unknown = { status: "ok", protocol_version: "1" };

before(async () => {
  server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ code: "ok", data: healthData }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("defaults to the zotigod default port", () => {
  if (!process.env.ZOTIGOD_URL) {
    assert.equal(initialBaseUrl, "http://127.0.0.1:8766");
  }
});

test("accepts only the current zotigod health protocol", async () => {
  assert.deepEqual(await health(), { status: "ok", protocol_version: "1" });

  healthData = { status: "ok" };
  await assert.rejects(health(), /protocol_version/);

  healthData = { status: "ok", protocol_version: "2" };
  await assert.rejects(health(), /incompatible/);

  healthData = { status: "ok", protocol_version: "1" };
  assert.match(getDaemonConfig().baseUrl, /^http:\/\/127\.0\.0\.1:/);
});
