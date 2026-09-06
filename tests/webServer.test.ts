import { initializeHosts } from "../backend/hosts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { createWebServer } from "../web/server";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";

test("Web streams forward reconnect cursors, isolate logout and close at session expiry", { timeout: 5000 }, async (context) => {
  const original = getDaemonConfig().baseUrl;
  const upstream = new Map<string, ServerResponse>();
  let ready!: () => void;
  const connected = new Promise<void>((resolve) => { ready = resolve; });
  const daemon = createServer((incoming, response) => {
    upstream.set(incoming.url!, response);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(": connected\n\n");
    if (upstream.size === 2) ready();
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const daemonAddress = daemon.address(); assert.ok(daemonAddress && typeof daemonAddress !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${daemonAddress.port}`);
  const origin = "http://127.0.0.1:8080";
  const token = "test-only-independent-cookie-token";
  const server = createWebServer({ origin, token, assetsPath: "/unused-test-assets" });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const post = (endpoint: string, cookie = "") => new Promise<string>((resolve, reject) => {
    const outgoing = request(url + endpoint, {
      method: "POST", headers: { Host: "127.0.0.1:8080", Origin: origin, Cookie: cookie, "Content-Type": "application/json", "X-Zotigo-Request": "1" },
    }, (incoming) => {
      incoming.resume();
      incoming.on("error", reject);
      incoming.on("end", () => {
        if (incoming.statusCode !== 200) { reject(new Error(`Unexpected status ${incoming.statusCode}`)); return; }
        resolve(incoming.headers["set-cookie"]![0].split(";")[0]);
      });
    });
    outgoing.on("error", reject); outgoing.end(JSON.stringify({ token }));
  });
  const openStream = (session: string, cookie: string) => new Promise<IncomingMessage>((resolve, reject) => {
    const outgoing = request(`${url}/api/events?session=${session}&after=3`, {
      headers: { Host: "127.0.0.1:8080", Cookie: cookie, "Last-Event-ID": "17" },
    }, (incoming) => { incoming.on("error", () => {}); incoming.resume(); resolve(incoming); });
    outgoing.on("error", reject); outgoing.end();
  });
  const clients: IncomingMessage[] = [];
  try {
    const cookieA = await post("/api/login");
    const cookieB = await post("/api/login");
    context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
    clients.push(await openStream("a", cookieA), await openStream("b", cookieB));
    await connected;
    assert.ok(upstream.has("/sessions/a/events?after=17"));
    assert.ok(upstream.has("/sessions/b/events?after=17"));
    const closed = new Promise<void>((resolve) => clients[0].once("close", resolve));
    await post("/api/logout", cookieA);
    await closed;
    assert.equal(clients[1].destroyed, false);
    const delivered = once(clients[1], "data");
    upstream.get("/sessions/b/events?after=17")!.write('event: delta\ndata: {"item_id":"message","role":"assistant","part_type":"text","delta":"still live"}\n\n');
    assert.match(String((await delivered)[0]), /still live/);
    const expired = new Promise<void>((resolve) => clients[1].once("close", resolve));
    context.mock.timers.tick(12 * 60 * 60 * 1000);
    await expired;
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(`${url}/api/session`, { headers: { Host: "127.0.0.1:8080", Cookie: cookieB } }, (incoming) => {
        incoming.resume(); incoming.on("end", () => resolve(incoming.statusCode)); incoming.on("error", reject);
      });
      outgoing.on("error", reject); outgoing.end();
    });
    assert.equal(status, 401);
  } finally {
    context.mock.timers.reset();
    for (const client of clients) client.destroy();
    const webClosed = once(server, "close"); server.close(); server.closeAllConnections(); await webClosed;
    const daemonClosed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await daemonClosed;
    setDaemonBaseUrl(original);
  }
});

test("real Web HTTP boundary enforces authentication, origin, method and operation allowlists", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zotigo-web-server-test-"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Zotigo</title>");
  const origin = "http://127.0.0.1:8080";
  const token = "test-only-web-server-access-token";
  const server = createWebServer({ origin, token, assetsPath: directory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const send = (endpoint: string, method: string, headers: Record<string, string>, body?: unknown) => new Promise<Response>((resolve, reject) => {
    const outgoing = request(url + endpoint, { method, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          for (const entry of Array.isArray(value) ? value : value ? [value] : []) headers.append(key, entry);
        }
        resolve(new Response(Buffer.concat(chunks).toString(), { status: incoming.statusCode, headers }));
      });
    });
    outgoing.on("error", reject);
    outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const get = (endpoint: string, headers: Record<string, string> = {}) => send(endpoint, "GET", { Host: "127.0.0.1:8080", ...headers });
  const post = (endpoint: string, body: unknown, headers: Record<string, string> = {}) => send(endpoint, "POST", {
    Host: "127.0.0.1:8080", Origin: origin, "Content-Type": "application/json", "X-Zotigo-Request": "1", ...headers,
  }, body);
  try {
    assert.equal((await get("/")).status, 200);
    assert.equal((await get("/api/session")).status, 401);
    assert.equal((await get("/", { Host: "attacker.example" })).status, 403);
    assert.equal((await post("/api/login", { token }, { Origin: "https://attacker.example" })).status, 403);
    assert.equal((await post("/api/login", { token }, { "X-Zotigo-Request": "" })).status, 403);
    assert.equal((await post("/api/login", { token: "wrong" })).status, 401);
    const login = await post("/api/login", { token });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    const headers = { Cookie: cookie };
    assert.equal((await get("/api/session", headers)).status, 200);
    initializeHosts(directory);
    const selection = { projectId: null, workspaceId: null, sessionId: null };
    assert.deepEqual(await (await post("/api/rpc", { channel: "daemon:get-config", args: [] }, headers)).json(), { ok: true, value: { baseUrl: `${origin}/?zotigoHost=local` }, selection });
    const saved = await (await post("/api/rpc", { channel: "hosts:save", args: [{ name: "Remote", baseUrl: "http://127.0.0.1:1234", token: "private-token" }] }, headers)).json();
    const hostId = saved.value.id;
    const otherTab = { ...headers, "X-Zotigo-Host": hostId };
    await post("/api/rpc", { channel: "hosts:delete", args: [hostId] }, headers);
    const hosts = await (await post("/api/rpc", { channel: "hosts:list", args: [] }, otherTab)).json();
    assert.equal(hosts.ok, true, "removed-host tab can still manage connections");
    assert.ok(!JSON.stringify(hosts).includes("private-token"));
    const activated = await (await post("/api/rpc", { channel: "hosts:activate", args: ["local"] }, otherTab)).json();
    assert.equal(activated.ok, true, "removed-host tab can switch back to local");
    assert.deepEqual(await (await post("/api/rpc", { channel: "__proto__", args: [] }, headers)).json(), { ok: false, error: "Unknown application operation", selection });
    assert.equal((await post("/api/rpc", { channel: "desktop:reveal-path", args: ["/"] }, headers)).status, 400);
    assert.equal((await get("/api/events?session=test&after=-1", headers)).status, 400);
    assert.equal((await get("/sessions/test/images/a.png")).status, 401);
    assert.equal((await get("/api/arbitrary-proxy", headers)).status, 404);
    assert.equal((await get("/%2e%2e%2fpackage.json")).status, 404);
    assert.equal((await post("/api/rpc", { channel: "daemon:get-config", args: [] })).status, 401);
    assert.match((await post("/api/logout", {}, headers)).headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal((await get("/api/session", headers)).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
    await rm(directory, { recursive: true, force: true });
  }
});
