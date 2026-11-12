import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticBuffer } from "../electron/diagnosticBuffer";
import type { DiagnosticSample } from "../shared/diagnostics";
const sample: DiagnosticSample = { action: "send-message", stage: "start", at: 1, elapsedMs: 0 };

test("flush waits for an in-flight batch and all queued hosts, preserving host identity", async () => {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const sent: Array<{ host: string; count: number }> = [];
  const buffer = new DiagnosticBuffer(async (host, samples) => { await barrier; sent.push({ host, count: samples.length }); });
  buffer.enabled = true;
  buffer.push("local", Array(100).fill(sample));
  const first = buffer.flush();
  buffer.push("remote", Array(400).fill(sample));
  let completed = false;
  const control = buffer.flush().then(() => { completed = true; });
  await Promise.resolve(); assert.equal(completed, false);
  release(); await Promise.all([first, control]);
  assert.deepEqual(sent, [{ host: "local", count: 100 }, ...Array(4).fill({ host: "remote", count: 100 })]);
});

test("buffer bounds bursts and accounts for transmission failures", async () => {
  const buffer = new DiagnosticBuffer(async () => { throw new Error("offline"); });
  buffer.push("local", [sample]); await buffer.flush(); assert.equal(buffer.dropped, 0);
  buffer.enabled = true; buffer.push("local", Array(510).fill(sample));
  assert.equal(buffer.dropped, 10);
  buffer.enabled = false; buffer.push("local", [sample]);
  await buffer.flush(); assert.equal(buffer.dropped, 510);
});
