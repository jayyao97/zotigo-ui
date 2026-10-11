import { test } from "node:test";
import assert from "node:assert/strict";
import { pickedImageInput } from "../src/core/imageInput";

const encoded = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const jpeg = encoded([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1,
]);
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlGAAAAAASUVORK5CYII=";
const webp = encoded([
  0x52, 0x49, 0x46, 0x46, 20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
  0x20,
]);

test("picker PNG metadata with exported JPEG bytes sends image/jpeg without altering bytes", () => {
  const asset = {
    mimeType: "image/png",
    fileName: "screenshot.png",
    base64: jpeg,
  };
  assert.deepEqual(pickedImageInput(asset), {
    mime_type: "image/jpeg",
    data_base64: jpeg,
  });
});
test("actual PNG and WebP signatures remain their own formats regardless of picker metadata", () => {
  for (const [base64, expected] of [
    [png, "image/png"],
    [webp, "image/webp"],
  ]) {
    const asset = { base64, mimeType: "image/jpeg" };
    assert.equal(pickedImageInput(asset).mime_type, expected);
    assert.equal(pickedImageInput(asset).data_base64, base64);
  }
});
test("valid exported JPEG does not require original asset MIME metadata", () => {
  assert.equal(pickedImageInput({ base64: jpeg }).mime_type, "image/jpeg");
  const heicSource = { base64: jpeg, mimeType: "image/heic" };
  assert.equal(pickedImageInput(heicSource).mime_type, "image/jpeg");
});
test("missing, malformed, truncated and unsupported bytes are rejected before submission", () => {
  for (const base64 of [
    null,
    "",
    "not base64!",
    "abcd=abc",
    "abc",
    "AA===",
    encoded([0xff, 0xd8]),
    Buffer.from("GIF89ahello world").toString("base64"),
    Buffer.from("RIFF0000WAVEdata").toString("base64"),
  ]) {
    assert.throws(() => pickedImageInput({ base64 }));
  }
});
test("oversized payload is rejected before header decoding", () => {
  assert.throws(
    () => pickedImageInput({ base64: "A".repeat(7 * 1024 * 1024) }),
    /5 MiB/,
  );
});
