import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";

for (const host of ["127.0.0.1", "0.0.0.0"]) test(`Web ${host} startup persists a private usable token without logging it`, { timeout: 10000 }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-web-startup-"));
  const listener = net.createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const origin = `http://127.0.0.1:${address.port}`;
  const env = { ...process.env, HOME: home, ZOTIGO_WEB_PORT: String(address.port), ZOTIGO_WEB_HOST: host, ZOTIGO_WEB_ALLOW_HTTP: "1", ZOTIGO_WEB_ORIGIN: origin, ZOTIGO_WEB_DATA_DIR: path.join(home, "web"), ZOTIGOD_URL: "http://127.0.0.1:8766" };
  delete (env as NodeJS.ProcessEnv).ZOTIGO_WEB_TOKEN;
  const child = spawn(process.execPath, [require.resolve("../web/main")], { env, stdio: "pipe" });
  const closed = once(child, "close");
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    const tokenPath = path.join(home, "web/access-token");
    for (let i = 0; i < 100 && !fs.existsSync(tokenPath); i++) {
      assert.equal(child.exitCode, null, output);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    assert.ok(token.length >= 32);
    assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
    const response = await fetch(`${origin}/api/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Zotigo-Request": "1" }, body: JSON.stringify({ token }) });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    child.kill("SIGTERM");
    await closed;
    const directory = path.join(home, ".zotigo/logs/web");
    const logs = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("");
    assert.match(logs, /web_start/);
    assert.match(logs, /web_exit code=0/);
    assert.ok(!logs.includes(token));
    assert.ok(!output.includes(token));
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("Web bootstrap records a dependency load failure", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-web-bootstrap-"));
  try {
    const child = spawnSync(process.execPath, ["-e", 'const Module=require("module"); const load=Module._load; Module._load=function(id,...args){if(id==="./application") throw new Error("dependency-load-marker"); return load.call(this,id,...args)}; require(process.argv[1]);', require.resolve("../web/main")], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    assert.equal(child.status, 1);
    const directory = path.join(home, ".zotigo/logs/web");
    const logs = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("");
    assert.match(logs, /dependency-load-marker/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("remote HTTP requires an explicit origin and plaintext opt-in", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-web-remote-"));
  try {
    for (const origin of [undefined, "http://dev:8080"]) {
      const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, ZOTIGO_WEB_HOST: "0.0.0.0", ZOTIGOD_URL: "http://127.0.0.1:8766" };
      delete env.ZOTIGO_WEB_ALLOW_HTTP;
      if (origin === undefined) delete env.ZOTIGO_WEB_ORIGIN; else env.ZOTIGO_WEB_ORIGIN = origin;
      const child = spawnSync(process.execPath, [require.resolve("../web/main")], { env, encoding: "utf8", timeout: 5000 });
      assert.equal(child.status, 1);
      assert.match(child.stderr, origin === undefined ? /Set ZOTIGO_WEB_ORIGIN/ : /ZOTIGO_WEB_ALLOW_HTTP/);
    }
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
