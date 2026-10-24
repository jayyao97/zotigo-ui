import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { loadInstalledLocalHost } from "../electron/localHostConfig";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import { listHosts, testHost, withHost } from "../backend/hosts";
import { fetchDaemon } from "../backend/daemonHttp";

test("installed Desktop Local uses the daemon token without shell configuration", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-installed-host-"));
  const previous = { url: process.env.ZOTIGOD_URL, token: process.env.ZOTIGOD_AUTH_TOKEN_FILE, base: getDaemonConfig().baseUrl };
  const seen: string[] = [];
  const server = createServer((request, response) => {
    seen.push(request.headers.authorization ?? "");
    response.writeHead(request.headers.authorization === "Bearer installed-secret" ? 200 : 401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data: { protocol_version: "1" } }));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tokenFile = path.join(directory, "daemon.token");
  const configFile = path.join(directory, "desktop.json");
  const resource = path.join(directory, "local-host.json");
  try {
    delete process.env.ZOTIGOD_URL; delete process.env.ZOTIGOD_AUTH_TOKEN_FILE;
    loadInstalledLocalHost(resource);
    assert.equal(process.env.ZOTIGOD_AUTH_TOKEN_FILE, undefined, "older installations remain unchanged");
    fs.writeFileSync(tokenFile, "installed-secret\n", { mode: 0o600 });
    fs.writeFileSync(configFile, JSON.stringify({ baseUrl, tokenFile }));
    fs.symlinkSync(configFile, resource);
    loadInstalledLocalHost(resource);
    assert.equal(getDaemonConfig().baseUrl, baseUrl);
    assert.equal(listHosts()[0].hasToken, true);
    assert.ok(!JSON.stringify(listHosts()).includes("installed-secret"));
    await testHost("local");
    await withHost("local", async () => { await (await fetchDaemon(baseUrl + "/projects")).text(); });
    await (await fetchDaemon(baseUrl + "/projects")).text();
    assert.deepEqual(seen, Array(4).fill("Bearer installed-secret"));
    delete process.env.ZOTIGOD_URL;
    process.env.ZOTIGOD_AUTH_TOKEN_FILE = "/explicit/token";
    loadInstalledLocalHost(resource);
    assert.equal(process.env.ZOTIGOD_AUTH_TOKEN_FILE, "/explicit/token");
    process.env.ZOTIGOD_URL = "https://explicit.example";
    delete process.env.ZOTIGOD_AUTH_TOKEN_FILE;
    loadInstalledLocalHost(resource);
    assert.equal(process.env.ZOTIGOD_AUTH_TOKEN_FILE, undefined, "never attach installed credentials to an explicit endpoint");
    delete process.env.ZOTIGOD_URL;
    fs.unlinkSync(configFile);
    assert.throws(() => loadInstalledLocalHost(resource), /ENOENT/, "missing configured file must not silently disable authentication");
  } finally {
    if (previous.url === undefined) delete process.env.ZOTIGOD_URL; else process.env.ZOTIGOD_URL = previous.url;
    if (previous.token === undefined) delete process.env.ZOTIGOD_AUTH_TOKEN_FILE; else process.env.ZOTIGOD_AUTH_TOKEN_FILE = previous.token;
    setDaemonBaseUrl(previous.base);
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
