import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authorizedExistingPath,
  openAuthorizedLocalPath,
  resolveLocalPathReference,
  saveAuthorizedTextFile,
} from "../backend/localFileService";

test("resolves relative file links against directories and files", () => {
  assert.equal(resolveLocalPathReference("src/main.go", "/workspace", "directory"), "/workspace/src/main.go");
  assert.equal(resolveLocalPathReference("../main.go", "/workspace/docs/plan.md", "file"), "/workspace/main.go");
  assert.equal(resolveLocalPathReference("file:///workspace/main.go", null, "directory"), "/workspace/main.go");
});

test("reads and saves authorized text without overwriting external changes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-local-file-"));
  try {
    const filePath = path.join(root, "plan.md");
    fs.writeFileSync(filePath, "first\n");
    const opened = await openAuthorizedLocalPath(filePath, [root]);
    assert.equal(opened.kind, "text");
    if (opened.kind !== "text") return;

    const saved = await saveAuthorizedTextFile({
      path: filePath,
      content: "second\n",
      expectedMtimeMs: opened.file.mtimeMs,
    }, [root]);
    assert.equal(saved.content, "second\n");

    fs.writeFileSync(filePath, "external\n");
    await assert.rejects(() => saveAuthorizedTextFile({
      path: filePath,
      content: "third\n",
      expectedMtimeMs: saved.mtimeMs,
    }, [root]), /changed on disk/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects files outside authorized roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-local-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-local-outside-"));
  try {
    const outsideFile = path.join(outside, "secret.txt");
    fs.writeFileSync(outsideFile, "secret");
    assert.throws(() => authorizedExistingPath(outsideFile, [root]), /outside the current Zotigo workspace/);
    const linkedFile = path.join(root, "linked-secret.txt");
    fs.symlinkSync(outsideFile, linkedFile);
    assert.throws(() => authorizedExistingPath(linkedFile, [root]), /outside the current Zotigo workspace/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects saving an opened file after its root is no longer authorized", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-local-revoked-"));
  try {
    const filePath = path.join(root, "revoked.md");
    fs.writeFileSync(filePath, "original\n");
    const opened = await openAuthorizedLocalPath(filePath, [root]);
    assert.equal(opened.kind, "text");
    if (opened.kind !== "text") return;
    await assert.rejects(() => saveAuthorizedTextFile({
      path: filePath,
      content: "changed\n",
      expectedMtimeMs: opened.file.mtimeMs,
    }, []), /outside the current Zotigo workspace/);
    assert.equal(fs.readFileSync(filePath, "utf8"), "original\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
