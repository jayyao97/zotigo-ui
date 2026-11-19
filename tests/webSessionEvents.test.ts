import assert from "node:assert/strict";
import test from "node:test";
import { createWebSessionEvents } from "../src/web/sessionEvents";
import type { SessionEventEnvelope } from "../shared/clientTypes";

test("Web multiplexes membership changes, resumes each cursor, and ignores stale frames", async () => {
  const connections: Array<{targets: unknown; closed: boolean; onmessage?: (message: {data: string}) => void}> = [];
  const seen: SessionEventEnvelope[] = [];
  const streams = createWebSessionEvents(targets => {
    const entry = {targets: JSON.parse(targets), closed: false, close() { this.closed = true; }};
    connections.push(entry);
    return entry as unknown as EventSource;
  }, event => { seen.push(event); }, () => {});
  streams.start(null); streams.start("a", 2); streams.start("b", 8);
  await Promise.resolve();
  assert.equal(connections.length, 1);
  connections[0].onmessage!({data: JSON.stringify({session_id: "a", event: {type: "item", item: {sequence: 7}}})});
  streams.stop("b"); streams.start("c");
  await Promise.resolve();
  assert.ok(connections[0].closed);
  assert.deepEqual(connections[1].targets, [{id: null}, {id:"a", after:7}, {id:"c"}]);
  const before = seen.length;
  connections[0].onmessage!({data: JSON.stringify({session_id: "a", status:"reconnecting"})});
  assert.equal(seen.length, before);
  streams.stop(); assert.ok(connections[1].closed);
});
