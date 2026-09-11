import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authorizedExistingPath,
  imageMediaType,
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
    assert.deepEqual(await openAuthorizedLocalPath(root, [root]), { kind: "directory", path: fs.realpathSync(root) });
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

test("previews supported image files only when their signatures match", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-local-image-"));
  try {
    const imagePath = path.join(root, "preview.png");
    const image = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("preview"),
    ]);
    fs.writeFileSync(imagePath, image);
    const opened = await openAuthorizedLocalPath(imagePath, [root]);
    assert.equal(opened.kind, "image");
    if (opened.kind === "image") {
      assert.equal(opened.file.mediaType, "image/png");
      assert.equal(opened.file.dataBase64, image.toString("base64"));
      assert.equal(opened.file.sizeBytes, image.length);
    }

    const spoofedPath = path.join(root, "notes.png");
    fs.writeFileSync(spoofedPath, "plain text");
    const spoofed = await openAuthorizedLocalPath(spoofedPath, [root]);
    assert.equal(spoofed.kind, "text");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("recognizes the supported image signatures", () => {
  for (const [extension, data, mediaType] of [
    [".png", Buffer.from("89504e470d0a1a0a", "hex"), "image/png"],
    [".jpg", Buffer.from("ffd8ff", "hex"), "image/jpeg"],
    [".gif", Buffer.from("GIF89a"), "image/gif"],
    [".webp", Buffer.from("RIFF0000WEBP"), "image/webp"],
    [".avif", Buffer.from("0000ftypavif"), "image/avif"],
    [".bmp", Buffer.from("BM"), "image/bmp"],
    [".ico", Buffer.from([0, 0, 1, 0]), "image/x-icon"],
    [".svg", Buffer.from("<?xml version=\"1.0\"?><!-- preview --><!DOCTYPE svg><svg></svg>"), "image/svg+xml"],
  ] as const) {
    assert.equal(imageMediaType(extension, data), mediaType, extension);
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
