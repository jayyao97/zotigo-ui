import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PerformanceLog } from "../backend/performanceLog";
import { parseDiagnosticSamples } from "../shared/diagnostics";

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zotigo-performance-"));
  try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
async function logs(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { recursive: true });
  return entries.filter(name => name.endsWith(".jsonl")).map(name => path.join(directory, name));
}
const limits = { fileBytes: 512, totalBytes: 1500, ageMs: 7 * 86400000, queueBytes: 4096 };

test("performance logs persist opt-in, rotate by size and hour, and bound retention", () => fixture(async directory => {
  let now = Date.now();
  const log = new PerformanceLog(directory, "test", limits, () => now);
  assert.equal(await log.initialize(), false);
  log.append({ action: "disabled" }); await log.flush(); assert.equal((await logs(directory)).length, 0);
  await log.enable(true);
  for (let i = 0; i < 30; i++) { log.append({ action: "request", count: i }); await log.flush(); }
  let files = await logs(directory);
  const sizes = await Promise.all(files.map(async file => (await fs.stat(file)).size));
  assert.ok(files.length > 1); assert.ok(sizes.every(size => size <= 512)); assert.ok(sizes.reduce((a, b) => a + b, 0) <= 1500);
  now += 3600000; log.append({ action: "next-hour" }); await log.flush();
  files = await logs(directory);
  assert.ok(files.some(file => path.basename(file).startsWith(new Date(now).toISOString().slice(11, 13))));
  const restarted = new PerformanceLog(directory, "test", limits, () => now);
  assert.equal(await restarted.initialize(), true);
  await restarted.enable(false); restarted.append({ action: "off" }); await restarted.flush();
  assert.ok(!(await Promise.all((await logs(directory)).map(file => fs.readFile(file, "utf8")))).join("").includes('"off"'));
  for (const file of await logs(directory)) await fs.utimes(file, new Date(now - limits.ageMs - 1), new Date(now - limits.ageMs - 1));
  await new PerformanceLog(directory, "test", limits, () => now).initialize();
  assert.equal((await logs(directory)).length, 0);
}));

test("exports stream filtered records and clear preserves the enabled preference", () => fixture(async directory => {
  let now = Date.now() - 7200000;
  const log = new PerformanceLog(directory, "test", undefined, () => now);
  await log.initialize(); await log.enable(true);
  log.append({ action: "old" }); await log.flush();
  now += 7200000; log.append({ action: "recent" }); await log.flush();
  const output = path.join(directory, "export.gz");
  await log.export(output, "hour");
  const lines = gunzipSync(await fs.readFile(output)).toString().trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(lines.map(line => line.action), ["recent"]);
  assert.equal(lines[0].version, "test"); assert.ok(lines[0].run);
  await log.export(output, "all");
  assert.equal(gunzipSync(await fs.readFile(output)).toString().trim().split("\n").length, 2);
  await log.clear(); assert.equal((await logs(directory)).length, 0);
  assert.equal(await new PerformanceLog(directory, "test").initialize(), true);
  log.append({ action: "after-clear" }); await log.flush(); assert.equal((await logs(directory)).length, 1);
}));

test("bounded queues drop excess records, reject oversized profiles, and recover after write failure", () => fixture(async directory => {
  const log = new PerformanceLog(directory, "test", { ...limits, queueBytes: 512 });
  await log.initialize(); await log.enable(true);
  for (let i = 0; i < 100; i++) log.append({ action: "burst" });
  await log.flush(); assert.ok(log.dropped > 0);
  await assert.rejects(log.profile("x".repeat(1000)), /size limit/);
  await log.clear();
  // Turning the log root into a file exercises a real filesystem write error.
  await fs.rm(directory, { recursive: true }); await fs.writeFile(directory, "blocked");
  log.append({ action: "failure" }); await log.flush(); assert.equal(log.error, true);
  await fs.rm(directory); await fs.mkdir(directory);
  await log.enable(true); log.append({ action: "recovered" }); await log.flush();
  assert.equal(log.error, false); assert.equal((await logs(directory)).length, 1);
}));

test("renderer diagnostic parser strips unapproved data and rejects arbitrary text", () => {
  const sample = { action: "send-message", stage: "request", at: 12, elapsedMs: 2, text: "secret", token: "secret", url: "https://secret", cached: false };
  assert.deepEqual(parseDiagnosticSamples([sample]), [{ action: "send-message", stage: "request", at: 12, elapsedMs: 2, cached: false }]);
  assert.throws(() => parseDiagnosticSamples([{ ...sample, stage: "secret" }]));
  assert.throws(() => parseDiagnosticSamples(Array(101).fill(sample)));
  assert.throws(() => parseDiagnosticSamples([{ ...sample, elapsedMs: Infinity }]));
});

test("export recovers valid records after a truncated crash write", () => fixture(async directory => {
  const log = new PerformanceLog(directory, "test"); await log.initialize(); await log.enable(true);
  log.append({ action: "before-crash" }); await log.flush();
  await fs.appendFile((await logs(directory))[0], '{"partial":');
  const output = path.join(directory, "crash.gz"); await log.export(output, "all");
  const lines = gunzipSync(await fs.readFile(output)).toString().trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines[0].action, "before-crash");
  assert.deepEqual(lines[1], { kind: "export-incomplete-records", skipped: 1 });
}));

test("normal close drains pending writes without disabling the saved preference", () => fixture(async directory => {
  const log = new PerformanceLog(directory, "test"); await log.initialize(); await log.enable(true);
  for (let i = 0; i < 20; i++) log.append({ action: "before-quit", count: i });
  await log.close();
  log.append({ action: "after-quit" }); await log.flush();
  const content = (await Promise.all((await logs(directory)).map(file => fs.readFile(file, "utf8")))).join("");
  assert.equal(content.trim().split("\n").length, 20);
  assert.ok(!content.includes("after-quit"));
  assert.equal(await new PerformanceLog(directory, "test").initialize(), true);
}));
