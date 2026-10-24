import test from "node:test";
import assert from "node:assert/strict";
import { keyboardInset } from "../src/core/keyboardInset";

const frame = { y: 0, height: 750 };
test("normal docked keyboard overlap includes the navigation header once", () => {
  assert.equal(keyboardInset(frame, { screenY: 550, height: 300 }, 100), 300);
  assert.equal(keyboardInset(frame, undefined, 100), 0);
});
test("foreground transition coordinates cannot collapse the screen", () => {
  assert.equal(keyboardInset(frame, { screenY: 0, height: 300 }, 100), 0);
  assert.equal(keyboardInset(frame, { screenY: -300, height: 300 }, 100), 0);
  assert.equal(keyboardInset(frame, { screenY: 50, height: 300 }, 100), 300);
  assert.equal(keyboardInset(frame, { screenY: 850, height: 300 }, 100), 0);
});
test("resizing recomputes overlap and a hidden keyboard removes all avoidance", () => {
  const keyboard = { screenY: 550, height: 300 };
  assert.equal(keyboardInset({ y: 0, height: 600 }, keyboard, 100), 150);
  assert.equal(keyboardInset({ y: 0, height: 400 }, keyboard, 100), 0);
  assert.equal(keyboardInset(frame, { screenY: 550, height: 0 }, 100), 0);
});
