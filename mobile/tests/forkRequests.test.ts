import { test } from "node:test";
import assert from "node:assert/strict";
import { ForkRequests } from "../src/core/forkRequests";

function counter() {
  let n = 0;
  return () => `req-${++n}`;
}

test("a retried fork after an uncertain failure reuses its request ID", async () => {
  const forks = new ForkRequests(counter());
  const sent: string[] = [];
  await assert.rejects(
    forks.fork(undefined, async (id) => {
      sent.push(id);
      throw new Error("timed out");
    }),
  );
  await forks.fork(undefined, async (id) => sent.push(id));
  assert.deepEqual(sent, ["req-1", "req-1"]);
});

test("forking the same point again after a success makes a new fork", async () => {
  const forks = new ForkRequests(counter());
  const sent: string[] = [];
  await forks.fork("turn-1", async (id) => sent.push(id));
  await forks.fork("turn-1", async (id) => sent.push(id));
  assert.deepEqual(sent, ["req-1", "req-2"]);
});

test("each fork point has its own request ID", async () => {
  const forks = new ForkRequests(counter());
  const sent: string[] = [];
  const fail = async (id: string) => {
    sent.push(id);
    throw new Error("offline");
  };
  await assert.rejects(forks.fork(undefined, fail));
  await assert.rejects(forks.fork("turn-1", fail));
  await assert.rejects(forks.fork("turn-1", fail));
  assert.deepEqual(sent, ["req-1", "req-2", "req-2"]);
});
