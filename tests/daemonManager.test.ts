import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import { managedZotigodBinaryPath, startManagedZotigodIfNeeded } from "../electron/daemonManager";

test("places the managed zotigod binary in stable Desktop user data", () => {
  const userDataPath = path.join(path.sep, "tmp", "Zotigo User Data");
  const executable = process.platform === "win32" ? "zotigod.exe" : "zotigod";
  assert.equal(managedZotigodBinaryPath(userDataPath), path.join(userDataPath, "bin", executable));
});

test("macOS development signing failure preserves the installed binary", { skip: process.platform === "win32" }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zotigo-signing-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "darwin" });
  t.after(() => Object.defineProperty(process, "platform", originalPlatform));
  const originalEnv = { ...process.env };
  t.after(() => { process.env = originalEnv; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("test daemon is offline"); });
  t.mock.method(console, "warn", () => {});
  const checkout = path.join(directory, "source");
  const commands = path.join(directory, "commands");
  await fs.mkdir(path.join(checkout, "cmd/zotigod"), { recursive: true });
  await fs.writeFile(path.join(checkout, "cmd/zotigod/main.go"), "fixture");
  await fs.mkdir(path.join(checkout, "scripts"));
  await fs.writeFile(path.join(checkout, "scripts/sign-macos-daemon.sh"), '#!/bin/sh\nprintf attempted > signing-attempt\nexit 1\n');
  await fs.mkdir(commands);
  await fs.writeFile(path.join(commands, "go"), '#!/bin/sh\nprintf unsigned > "$3"\n', { mode: 0o755 });
  process.env.PATH = `${commands}${path.delimiter}${originalEnv.PATH}`;
  process.env.ZOTIGOD_WORKDIR = checkout;
  process.env.ZOTIGO_DESKTOP_MANAGE_DAEMON = "1";
  const binary = managedZotigodBinaryPath(directory);
  await fs.mkdir(path.dirname(binary));
  await fs.writeFile(binary, "previous signed binary");
  await startManagedZotigodIfNeeded(directory, directory);
  assert.equal(await fs.readFile(path.join(checkout, "signing-attempt"), "utf8"), "attempted");
  assert.equal(await fs.readFile(binary, "utf8"), "previous signed binary");
  await assert.rejects(fs.access(`${binary}.tmp-${process.pid}`));
});
