import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { fetchDaemon, daemonHeaders } from "../backend/daemonHttp";

test("daemon requests authenticate, rotate credentials and reject redirects or foreign endpoints", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-auth-"));
  const previous = { file: process.env.ZOTIGOD_AUTH_TOKEN_FILE, url: process.env.ZOTIGOD_URL };
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(req.headers.authorization ?? "");
    if (req.url === "/redirect") { res.writeHead(302, { Location: "/unexpected" }); res.end(); return; }
    res.end("ok");
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    process.env.ZOTIGOD_URL = base;
    process.env.ZOTIGOD_AUTH_TOKEN_FILE = path.join(directory, "token");
    fs.writeFileSync(process.env.ZOTIGOD_AUTH_TOKEN_FILE, "first-token\n");
    for (const route of ["/projects", "/sessions/one/events", "/sessions/one/images/two"]) {
      const response = await fetchDaemon(base + route); await response.text();
    }
    assert.deepEqual(seen, Array(3).fill("Bearer first-token"));
    fs.writeFileSync(process.env.ZOTIGOD_AUTH_TOKEN_FILE, "rotated-token\n");
    await (await fetchDaemon(base + "/projects")).text();
    assert.equal(seen.at(-1), "Bearer rotated-token");
    await assert.rejects(async () => fetchDaemon(base + "/redirect"));
    assert.equal(seen.length, 5, "redirect target must not be contacted");
    assert.throws(() => daemonHeaders("https://other.example/projects"), /endpoint/);
    fs.writeFileSync(process.env.ZOTIGOD_AUTH_TOKEN_FILE, "\n");
    assert.throws(() => daemonHeaders(base), /empty/);
    delete process.env.ZOTIGOD_AUTH_TOKEN_FILE;
    assert.equal(daemonHeaders(base).has("Authorization"), false);
  } finally {
    if (previous.file === undefined) delete process.env.ZOTIGOD_AUTH_TOKEN_FILE; else process.env.ZOTIGOD_AUTH_TOKEN_FILE = previous.file;
    if (previous.url === undefined) delete process.env.ZOTIGOD_URL; else process.env.ZOTIGOD_URL = previous.url;
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
