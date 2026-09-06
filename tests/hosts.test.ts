import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeHosts, saveHost, listHosts, deleteHost, withHost, currentHost } from "../backend/hosts";
import { daemonHeaders } from "../backend/daemonHttp";

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
    assert.throws(() => saveHost({ id: b.id, name: "Changed", baseUrl: "https://other.example" }), /new host/);
    initializeHosts(directory); assert.equal(listHosts().find((host) => host.id === b.id)?.name, "Beta");
    assert.throws(() => saveHost({ name: "Bad", baseUrl: "http://user:password@host" }), /credentials/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
