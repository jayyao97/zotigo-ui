import assert from "node:assert/strict";
import test from "node:test";

import { resolveDevServerUrl } from "../electron/devServerUrl";

test("accepts only loopback HTTP development servers", () => {
  assert.equal(resolveDevServerUrl("http://127.0.0.1:5174"), "http://127.0.0.1:5174");
  assert.equal(resolveDevServerUrl("http://localhost:5174/"), "http://localhost:5174");
  assert.throws(() => resolveDevServerUrl("https://example.com"), /loopback HTTP URL/);
  assert.throws(() => resolveDevServerUrl("http://127.0.0.1:5174/?token=secret"), /loopback HTTP URL/);
});
