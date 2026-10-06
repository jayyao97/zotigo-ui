import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadWebAccessToken } from "../web/accessToken";

test("Web token persists, supports overrides and explicit rotation, and remains private", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "web-token-"));
  try {
    const token = loadWebAccessToken(directory);
    const file = path.join(directory, "access-token");
    assert.ok(token.length >= 32);
    fs.chmodSync(file, 0o644);
    assert.equal(loadWebAccessToken(directory), token);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const override = "explicit-web-token-for-test-only";
    assert.equal(loadWebAccessToken(directory, override), override);
    assert.equal(loadWebAccessToken(directory), token);
    assert.throws(() => loadWebAccessToken(directory, ""), /at least 24/);
    fs.unlinkSync(file);
    assert.notEqual(loadWebAccessToken(directory), token);
    fs.writeFileSync(file, "short");
    assert.throws(() => loadWebAccessToken(directory), /invalid/);
    assert.equal(fs.readFileSync(file, "utf8"), "short");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Web token refuses symbolic and hard links without changing their targets", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "web-token-links-"));
  try {
    const target = path.join(directory, "target");
    const file = path.join(directory, "access-token");
    fs.writeFileSync(target, "existing-target-content-is-not-a-token", { mode: 0o644 });
    fs.chmodSync(target, 0o644);
    for (const link of [fs.symlinkSync, fs.linkSync]) {
      link(target, file);
      assert.throws(() => loadWebAccessToken(directory));
      assert.equal(fs.readFileSync(target, "utf8"), "existing-target-content-is-not-a-token");
      assert.equal(fs.statSync(target).mode & 0o777, 0o644);
      fs.unlinkSync(file);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
