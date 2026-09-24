import assert from "node:assert/strict";
import test from "node:test";

import { composerTextareaSizing, resizeTextareaToContent } from "../src/textareaSizing";

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

test("only height changes require conversation scrolling, including shrinking and capped input", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { getComputedStyle: () => ({ lineHeight: "20px", minHeight: "36px" }) } });
  try {
    const element = { style: { height: "", overflowY: "" }, scrollHeight: 40 };
    const resize = () => resizeTextareaToContent(element as unknown as HTMLTextAreaElement);
    assert.equal(resize(), true);
    assert.equal(resize(), false);
    element.scrollHeight = 60;
    assert.equal(resize(), true);
    element.scrollHeight = 400;
    assert.equal(resize(), true);
    assert.equal(element.style.height, "260px");
    assert.equal(element.style.overflowY, "auto");
    element.scrollHeight = 420;
    assert.equal(resize(), false);
    element.scrollHeight = 20;
    assert.equal(resize(), true);
    assert.equal(element.style.height, "36px");
    assert.equal(element.style.overflowY, "hidden");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
