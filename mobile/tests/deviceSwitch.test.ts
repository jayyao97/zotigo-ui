import { test } from "node:test";
import assert from "node:assert/strict";
import { DaemonClient, type Connection, type Host } from "../src/core/client";
import { DeviceSwitch, DeviceUnreachable, reach, type SwitchState } from "../src/core/deviceSwitch";

const home: Host = { id: "home", name: "Home", baseUrl: "https://home.test" };
const mini: Host = { id: "mini", name: "Mac mini", baseUrl: "https://mini.test" };
const ok = () => Response.json({ code: "ok", data: { status: "ok", protocol_version: "1" } });
/** Neither answers nor refuses, like a sleeping machine: settles only when aborted. */
const silent = (init?: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
  );

function harness(answer: Record<string, (init?: RequestInit) => Promise<Response> | Response>, timeout = 20) {
  const clients: DaemonClient[] = [];
  const remembered: string[] = [];
  const states: SwitchState[] = [];
  const connected: string[] = [];
  const switcher = new DeviceSwitch(
    {
      connection: async (host): Promise<Connection> => ({ ...host, token: "t" }),
      create: (connection) => {
        const client = new DaemonClient(connection, async (_, init) => answer[connection.id](init));
        clients.push(client);
        return client;
      },
      remember: async (id) => {
        remembered.push(id);
      },
      timeout,
    },
    (state) => states.push(state),
  );
  const onConnect = (client: DaemonClient) => connected.push(client.connection.id);
  return { switcher, clients, remembered, states, connected, onConnect };
}

test("a device that never answers is reported as unreachable instead of waiting on the request", async () => {
  const client = new DaemonClient({ ...mini, token: "t" }, async (_, init) => silent(init));
  await assert.rejects(reach(client, 20), DeviceUnreachable);
  await reach(new DaemonClient({ ...home, token: "t" }, async () => ok()), 20);
});

test("a wrong token fails the reach even though /health is public", async () => {
  // The daemon answers /health without checking the token.
  const daemon = async (url: string | URL | Request) =>
    new URL(String(url)).pathname === "/health"
      ? ok()
      : Response.json({ code: "unauthorized", message: "authentication required" }, { status: 401 });
  const client = new DaemonClient({ ...home, token: "wrong" }, daemon);
  await assert.rejects(reach(client, 1000), /authentication required/);
});

test("choosing another device abandons one that is still connecting", async () => {
  const h = harness({ mini: silent, home: ok }, 60_000);
  const first = h.switcher.select(mini, h.onConnect);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.switcher.state.connecting?.id, "mini");
  // No waiting for the first attempt: the second starts and finishes on its own.
  await h.switcher.select(home, h.onConnect);
  assert.deepEqual(h.connected, ["home"]);
  assert.deepEqual(h.remembered, ["home"]);
  assert.deepEqual(h.switcher.state, {});
  assert.equal(h.clients[0].signal.aborted, true, "the abandoned connection is disposed");
  assert.equal(h.clients[1].signal.aborted, false);
  await first;
  assert.ok(!h.states.some((state) => state.failed), "an abandoned attempt reports nothing");
});

test("an unreachable device fails with its name attached and leaves the next choice open", async () => {
  const h = harness({ mini: silent, home: ok });
  await h.switcher.select(mini, h.onConnect);
  assert.equal(h.switcher.state.connecting, undefined);
  assert.equal(h.switcher.state.failed?.host.id, "mini");
  assert.ok(h.switcher.state.failed?.error instanceof DeviceUnreachable);
  assert.deepEqual(h.connected, []);
  assert.deepEqual(h.remembered, [], "a failed device is not reconnected to on next launch");
  assert.equal(h.clients[0].signal.aborted, true);
  await h.switcher.select(home, h.onConnect);
  assert.deepEqual(h.connected, ["home"]);
  assert.deepEqual(h.switcher.state, {});
});

test("an attempt that succeeds after being abandoned does not take over", async () => {
  let answerMini!: () => void;
  const late = () => new Promise<Response>((resolve) => (answerMini = () => resolve(ok())));
  const h = harness({ mini: late, home: ok }, 60_000);
  const first = h.switcher.select(mini, h.onConnect);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await h.switcher.select(home, h.onConnect);
  answerMini();
  await first;
  assert.deepEqual(h.connected, ["home"]);
  assert.deepEqual(h.remembered, ["home"]);
});

test("cancelling abandons the attempt and clears a reported failure", async () => {
  const h = harness({ mini: silent, home: ok }, 60_000);
  const attempt = h.switcher.select(mini, h.onConnect);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.switcher.cancel();
  await attempt;
  assert.deepEqual(h.switcher.state, {});
  assert.equal(h.clients[0].signal.aborted, true);
  assert.deepEqual(h.connected, []);

  const failing = harness({ mini: silent, home: ok });
  await failing.switcher.select(mini, failing.onConnect);
  assert.ok(failing.switcher.state.failed);
  failing.switcher.cancel();
  assert.deepEqual(failing.switcher.state, {});
});

test("missing credentials are reported without creating a connection", async () => {
  const states: SwitchState[] = [];
  let created = 0;
  const switcher = new DeviceSwitch(
    {
      connection: async () => {
        throw new Error("Device credentials are missing.");
      },
      create: () => {
        created++;
        throw new Error("unreachable");
      },
      remember: async () => {},
    },
    (state) => states.push(state),
  );
  await switcher.select(mini, () => assert.fail("must not connect"));
  assert.equal(created, 0);
  assert.equal((switcher.state.failed?.error as Error).message, "Device credentials are missing.");
});
