import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { managedZotigodBinaryPath } from "../electron/daemonManager";

test("places the managed zotigod binary in stable Desktop user data", () => {
  const userDataPath = path.join(path.sep, "tmp", "Zotigo User Data");
  const executable = process.platform === "win32" ? "zotigod.exe" : "zotigod";
  assert.equal(managedZotigodBinaryPath(userDataPath), path.join(userDataPath, "bin", executable));
});
