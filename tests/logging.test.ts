import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { DiagnosticLog } from "../backend/logging";

function logFiles(directory: string): string[] {
  return fs.readdirSync(directory).filter((name) => name.startsWith("run-") && name.endsWith(".log")).map((name) => path.join(directory, name));
}

test("diagnostic rotation bounds size and history across restarts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-logs-"));
  try {
    for (let i = 0; i < 10; i++) new DiagnosticLog(directory, 128, 4).write("x".repeat(1000));
    const files = logFiles(directory);
    assert.equal(files.length, 4);
    for (const file of files) {
      const stat = fs.statSync(file);
      assert.ok(stat.size <= 128);
      assert.equal(stat.mode & 0o777, 0o600);
      assert.match(fs.readFileSync(file, "utf8"), /\[truncated\]/);
    }
    const log = new DiagnosticLog(directory, 128, 4);
    log.write("first\n");
    for (const file of logFiles(directory)) fs.unlinkSync(file);
    log.write("after pruning\n");
    assert.equal(fs.readFileSync(logFiles(directory)[0], "utf8"), "after pruning\n");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("concurrent processes share the component log budget", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-logs-processes-"));
  try {
    await Promise.all(Array.from({ length: 8 }, () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["-e", 'const {DiagnosticLog}=require(process.argv[1]); const log=new DiagnosticLog(process.argv[2],256,128,1024); for(let i=0;i<30;i++) log.write("x".repeat(100));', require.resolve("../backend/logging"), directory], { stdio: "pipe" });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`logger child exited ${code}`)));
    })));
    const files = logFiles(directory);
    assert.ok(files.length > 0 && files.length <= 128);
    assert.ok(files.every((file) => fs.statSync(file).size <= 256));
    assert.ok(files.reduce((sum, file) => sum + fs.statSync(file).size, 0) <= 1024);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("console and fatal errors are persisted without suppressing process failure", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-logs-fatal-"));
  try {
    const child = spawnSync(process.execPath, ["-e", 'require(process.argv[1]).startLogging("web"); console.warn("warning-marker"); throw new Error("fatal-marker");', require.resolve("../backend/logging")], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    assert.equal(child.status, 1);
    const contents = logFiles(path.join(home, ".zotigo/logs/web")).map((file) => fs.readFileSync(file, "utf8")).join("");
    assert.match(contents, /warning-marker/);
    assert.match(contents, /fatal-marker/);
    assert.match(contents, /web_exit code=1/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});


test("small restart logs survive until the file-count ceiling", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-logs-small-"));
  try {
    for (let i = 0; i < 10; i++) new DiagnosticLog(directory, 128, 12, 512).write("small\n");
    assert.equal(logFiles(directory).length, 10);
    for (let i = 0; i < 10; i++) new DiagnosticLog(directory, 128, 12, 512).write("small\n");
    assert.equal(logFiles(directory).length, 12);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("total bytes prune oldest files before the count ceiling", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-logs-budget-"));
  try {
    for (let i = 0; i < 10; i++) {
      const before = new Set(logFiles(directory));
      new DiagnosticLog(directory, 128, 128, 350).write("x".repeat(100));
      const created = logFiles(directory).find((file) => !before.has(file));
      assert.ok(created);
      fs.utimesSync(created, i + 1, i + 1);
    }
    const files = logFiles(directory);
    assert.equal(files.length, 3);
    assert.ok(files.every((file) => fs.statSync(file).mtimeMs >= 8000));
    assert.ok(files.reduce((sum, file) => sum + fs.statSync(file).size, 0) <= 350);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
