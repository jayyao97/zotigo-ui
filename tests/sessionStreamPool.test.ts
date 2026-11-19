import assert from "node:assert/strict";
import test from "node:test";
import { SessionStreamPool } from "../src/sessionStreamPool";
import { parseSessionEventFrame } from "../backend/zotigod";

test("only selected and recently viewed active sessions consume the three body slots", async () => {
  const open = new Set<string | null>();
  const drains = new Map<string, () => void>();
  const pool = new SessionStreamPool({
    subscribe(id) {
      assert.ok(!open.has(id));
      open.add(id);
      assert.ok(open.size <= 4);
    },
    unsubscribe(id) { open.delete(id); },
    activity() {},
    catchUp(id) { return new Promise(resolve => drains.set(id, resolve)); },
  });
  const snapshot = (ids: string[], revision: number) => {
    const frame = parseSessionEventFrame({event: "activity", id: "", data: [
      JSON.stringify({revision, active: Object.fromEntries(ids.map(id => [id, "running"]))}),
    ]});
    assert.ok(frame);
    pool.receive({session_id: null, event: frame});
  };
  pool.start();
  snapshot(["a","b","c","d"], 4);
  pool.select("idle");
  assert.deepEqual([...open], [null]);
  for (const id of ["a","b","c","a","d"]) pool.select(id);
  assert.deepEqual([...open], [null,"c","a","d"]);
  snapshot(["b","c","d"], 5);
  assert.ok(!open.has("a"), "release the body connection before awaiting the terminal tail RPC");
  drains.get("a")!();
  await Promise.resolve();
  assert.ok(!open.has("a"));
  pool.receive({session_id:null, status:"reconnecting"});
  assert.deepEqual([...open], [null,"d"]);
  snapshot([], 0); // restarted daemon, revision can reset
  drains.get("d")!();
  await Promise.resolve();
  assert.deepEqual([...open], [null]);
  pool.dispose();
  assert.equal(open.size, 0);
});

test("old hosts keep the selected session subscribed and release it on navigation", () => {
  const open = new Set<string | null>();
  const pool = new SessionStreamPool({
    subscribe(id) { open.add(id); }, unsubscribe(id) { open.delete(id); },
    activity() {}, async catchUp() {},
  });
  pool.start();
  pool.receive({session_id:null, status:"unsupported"});
  pool.select("a");
  pool.select("b");
  assert.ok(!open.has("a") && open.has("b"));
  pool.dispose();
});

test("a restarted turn cancels stale terminal recovery and keeps its reader", async () => {
  let recovery: AbortSignal | undefined;
  const open = new Set<string | null>();
  const pool = new SessionStreamPool({
    subscribe(id) { open.add(id); }, unsubscribe(id) { open.delete(id); },
    activity() {},
    catchUp(id, signal) {
      assert.ok(!open.has(id), "a terminal fetch must have a free connection");
      recovery = signal;
      return Promise.resolve();
    },
  });
  pool.start();
  pool.select("a");
  pool.receive({session_id:null, event:{type:"activity",revision:1,active:{a:"running"}}});
  pool.receive({session_id:null, event:{type:"activity",revision:2,active:{}}});
  assert.ok(recovery && !recovery.aborted);
  pool.receive({session_id:null, event:{type:"activity",revision:3,active:{a:"running"}}});
  assert.ok(recovery.aborted);
  await Promise.resolve();
  assert.ok(open.has("a"));
  pool.dispose();
});
