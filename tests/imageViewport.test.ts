import assert from "node:assert/strict";
import test from "node:test";
import { clampImageOffset, fitImageScale } from "../src/imageViewport";
import { imageDownloadUrl } from "../backend/imageDownload";

test("fits portrait and landscape images without enlarging small images", () => {
  const viewport = { width: 1000, height: 600 };
  assert.equal(fitImageScale({ width: 800, height: 1200 }, viewport), 0.5);
  assert.equal(fitImageScale({ width: 2000, height: 500 }, viewport), 0.5);
  assert.equal(fitImageScale({ width: 200, height: 100 }, viewport), 1);
});

test("pan stays within image edges and recenters axes that fit", () => {
  const image = { width: 1000, height: 500 };
  const viewport = { width: 800, height: 600 };
  assert.deepEqual(clampImageOffset({ x: 900, y: -900 }, image, viewport, 1), { x: 100, y: 0 });
  assert.deepEqual(clampImageOffset({ x: -900, y: 900 }, image, viewport, 2), { x: -600, y: 200 });
  assert.deepEqual(clampImageOffset({ x: -900, y: 900 }, image, viewport, 0.5), { x: 0, y: 0 });
});

test("downloads only image endpoints on the configured daemon", () => {
  const base = "http://127.0.0.1:8766";
  assert.equal(imageDownloadUrl(`${base}/sessions/s1/images/image.png`, base), `${base}/sessions/s1/images/image.png`);
  for (const url of ["file:///etc/passwd", "https://example.com/image.png", `${base}/health`, `${base}/sessions/s1/images/../items`, "http://user:pass@127.0.0.1:8766/sessions/s1/images/a.png"]) {
    assert.throws(() => imageDownloadUrl(url, base));
  }
});
