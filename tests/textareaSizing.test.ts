import assert from "node:assert/strict";
import test from "node:test";

import { composerTextareaSizing } from "../src/textareaSizing";

test("caps composer growth at thirteen rows and enables scrolling", () => {
  assert.deepEqual(composerTextareaSizing({ scrollHeight: 120, lineHeight: 20, minHeight: 36 }), {
    height: 120,
    overflowY: "hidden",
  });
  assert.deepEqual(composerTextareaSizing({ scrollHeight: 500, lineHeight: 20, minHeight: 36 }), {
    height: 260,
    overflowY: "auto",
  });
});
