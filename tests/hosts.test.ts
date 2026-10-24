import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeHosts, saveHost, listHosts, deleteHost, withHost, currentHost, resolveHost } from "../backend/hosts";
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
