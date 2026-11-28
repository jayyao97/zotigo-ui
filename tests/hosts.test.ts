import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeHosts, saveHost, listHosts, deleteHost, withHost, currentHost, resolveHost } from "../backend/hosts";
import { daemonHeaders, fetchDaemon } from "../backend/daemonHttp";

test("saved hosts keep secrets private and concurrent operations retain their original connection", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-hosts-"));
  try {
    initializeHosts(directory);
    const a = saveHost({ name: "Alpha", baseUrl: "http://127.0.0.1:1234", token: "secret-a" });
    const b = saveHost({ name: "Beta", baseUrl: "http://127.0.0.1:1234", token: "secret-b" });
    assert.ok(!JSON.stringify(listHosts()).includes("secret-"));
    assert.equal(fs.statSync(path.join(directory, "hosts.json")).mode & 0o777, 0o600);
    let release!: () => void; const pause = new Promise<void>((resolve) => { release = resolve; });
    const first = withHost(a.id, async () => { await pause; assert.equal(currentHost()?.id, a.id); return daemonHeaders(a.baseUrl).get("Authorization"); });
    assert.equal(await withHost(b.id, async () => { await Promise.resolve(); return daemonHeaders(b.baseUrl).get("Authorization"); }), "Bearer secret-b");
    deleteHost(a.id); release();
    assert.equal(await first, "Bearer secret-a", "in-flight work retains its immutable credentials");
    assert.throws(() => withHost(a.id, () => {}), /no longer/);
    const oldRequest = withHost(b.id, async () => {
      await Promise.resolve();
      return currentHost();
    });
    const renamed = saveHost({ id: b.id, name: "Renamed", baseUrl: b.baseUrl });
    assert.equal(renamed.id, b.id, "renaming preserves connection identity");
    const changed = saveHost({ id: b.id, name: "Changed", baseUrl: "https://other.example" });
    assert.notEqual(changed.id, b.id);
    assert.equal((await oldRequest)?.baseUrl, b.baseUrl);
    assert.equal((await oldRequest)?.token, "secret-b");
    assert.throws(() => withHost(b.id, () => {}), /no longer/, "stale clients cannot send old session/file operations to the new endpoint");
    initializeHosts(directory);
    assert.equal(listHosts().find((host) => host.id === changed.id)?.name, "Changed");
    assert.equal(resolveHost(changed.id).baseUrl, "https://other.example");
    assert.equal(resolveHost(changed.id).token, "secret-b", "omitted token preserves the saved credential");
    const rotated = saveHost({ id: changed.id, name: "Changed", baseUrl: changed.baseUrl, token: "replacement" });
    assert.notEqual(rotated.id, changed.id);
    assert.throws(() => resolveHost(changed.id), /no longer/);
    assert.equal(resolveHost(rotated.id).token, "replacement");
    assert.ok(!JSON.stringify(listHosts()).includes("replacement"));
    const unchanged = saveHost({ id: rotated.id, name: "Changed", baseUrl: rotated.baseUrl, token: "replacement" });
    assert.equal(unchanged.id, rotated.id);
    const cleared = saveHost({ id: rotated.id, name: "Changed", baseUrl: rotated.baseUrl, token: "" });
    initializeHosts(directory);
    assert.equal(resolveHost(cleared.id).token, "");
    assert.equal(listHosts().find((host) => host.id === cleared.id)?.hasToken, false);
    assert.equal(listHosts().length, 2, "edits replace the saved entry rather than adding duplicates");
    assert.throws(() => saveHost({ id: a.id, name: "Deleted", baseUrl: a.baseUrl }), /no longer/);
    assert.throws(() => saveHost({ id: "local", name: "Changed", baseUrl: b.baseUrl }), /managed/);
    assert.throws(() => deleteHost("local"), /cannot be removed/);
    assert.throws(() => saveHost({ name: "Bad", baseUrl: "http://user:password@host" }), /credentials/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("host capability checks overlap instead of taking three network round trips", { timeout: 5000 }, async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const { testHost } = await import("../backend/hosts");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-host-check-"));
  const waiting: import("node:http").ServerResponse[] = [];
  const paths: string[] = [];
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer fixture-token");
    assert.equal(request.headers["cf-access-client-id"], "fixture-id");
    assert.equal(request.headers["cf-access-client-secret"], "fixture-secret");
    paths.push(request.url!); waiting.push(response);
    if (waiting.length === 3) for (const reply of waiting) {
      reply.writeHead(200, { "Content-Type": "application/json" });
      reply.end(JSON.stringify({ code: "ok", data: { protocol_version: "1" } }));
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    initializeHosts(directory);
    const host = saveHost({ name: "Fixture", baseUrl: `http://127.0.0.1:${address.port}`, token: "fixture-token",
      headers: [{ name: "CF-Access-Client-Id", value: "fixture-id" }, { name: "CF-Access-Client-Secret", value: "fixture-secret" }] });
    await testHost(host.id);
    assert.deepEqual(paths.sort(), ["/files/capabilities", "/health", "/projects"]);
  } finally {
    server.closeAllConnections(); server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("gateway headers stay private, scoped and editable across restarts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-gateway-"));
  try {
    initializeHosts(dir);
    const input = { name: "Work", baseUrl: "https://work.test" };
    const row = { name: "X-Gateway", value: "fixture-secret" };
    const first = saveHost({ ...input, headers: [row] });
    assert.deepEqual(first.headerNames, ["x-gateway"]);
    initializeHosts(dir);
    assert.ok(!JSON.stringify([first, listHosts()]).includes(row.value));
    const edit = { ...input, id: first.id };
    assert.equal(saveHost({ ...edit, headers: [{ name: row.name }] }).id, first.id);
    assert.throws(() => saveHost({ ...edit, baseUrl: "https://other.test", headers: [{ name: row.name }] }));
    for (const headers of [[row, { ...row, name: "x-gateway" }], [{ ...row, name: "Authorization" }], [{ ...row, value: "x\r\ny" }]])
      assert.throws(() => saveHost({ ...edit, headers }));
    withHost(first.id, () => {
      assert.equal(daemonHeaders(input.baseUrl).get(row.name), row.value);
      assert.throws(() => daemonHeaders("https://other.test"));
    });
    const rotated = saveHost({ ...edit, headers: [{ ...row, value: "updated" }] });
    assert.notEqual(rotated.id, first.id);
    const cleared = saveHost({ ...edit, id: rotated.id, headers: [] });
    assert.equal(withHost(cleared.id, () => daemonHeaders(input.baseUrl).get(row.name)), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a daemon redirect cannot forward gateway credentials", async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-redirect-"));
  let followed = false;
  const server = createServer((req, res) => {
    if (req.url === "/target") { followed = true; res.end(); return; }
    res.writeHead(302, { Location: "/target" }).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    initializeHosts(directory);
    const host = saveHost({ name: "Redirect", baseUrl: `http://127.0.0.1:${address.port}`, headers: [{ name: "X-Gateway", value: "fixture-secret" }] });
    await assert.rejects(withHost(host.id, () => fetchDaemon(host.baseUrl + "/start")));
    assert.equal(followed, false);
  } finally { server.closeAllConnections(); server.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
