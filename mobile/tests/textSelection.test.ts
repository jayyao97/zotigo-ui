import { test } from "node:test";
import assert from "node:assert/strict";
import { selectedExcerpt, validExcerpt } from "../src/core/textSelection";

test("selected passage retains UTF-16 source offset after trimming whitespace", () => {
  assert.deepEqual(
    selectedExcerpt("before  😀 hello  after", { start: 6, end: 17 }),
    { text: "😀 hello", startOffset: 8 },
  );
  assert.deepEqual(selectedExcerpt("hello", { start: 2, end: 2 }), {
    text: "",
    startOffset: 2,
  });
});
test("translation and references use Unicode character limit without rejecting emoji", () => {
  assert.equal(validExcerpt("😀".repeat(8000)), true);
  assert.equal(validExcerpt("😀".repeat(8001)), false);
  assert.equal(validExcerpt(" \n "), false);
  assert.deepEqual(selectedExcerpt("example", { start: -4, end: 900 }), {
    text: "example",
    startOffset: 0,
  });
});
