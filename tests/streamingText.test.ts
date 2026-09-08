import assert from "node:assert/strict";
import test from "node:test";

import {
  initialStreamingTextState,
  nextStreamingTextLength,
  planStreamingTextUpdate,
  shouldSmoothStreaming,
  type StreamingTextState,
} from "../src/streamingText";

test("streaming text advances progressively and catches up", () => {
  const text = "a".repeat(100);
  const first = nextStreamingTextLength(0, text);
  assert.ok(first > 0 && first < text.length);

  let length = first;
  for (let frame = 0; frame < 100 && length < text.length; frame += 1) {
    const next = nextStreamingTextLength(length, text);
    assert.ok(next > length);
    length = next;
  }
  assert.equal(length, text.length);
});

test("streaming text never splits a surrogate pair", () => {
  assert.equal(nextStreamingTextLength(0, "😀"), 2);
  assert.equal(nextStreamingTextLength(5, "short"), 5);
});

test("Zotigo streaming reveals over frames while Codex stays unchanged", () => {
  assert.equal(shouldSmoothStreaming("zotigo", true), true);
  assert.equal(shouldSmoothStreaming("codex", true), false);
  assert.equal(shouldSmoothStreaming("zotigo", false), false);

  let state = initialStreamingTextState("a".repeat(100), true, false);
  assert.equal(state.visibleText, "");
  state = nextFrame(state, "a".repeat(100), true);
  assert.ok(state.visibleText.length > 0 && state.visibleText.length < 100);
});

test("a durable same-id value keeps revealing the remaining streamed prefix", () => {
  const text = "streamed final response";
  let state = initialStreamingTextState(text, true, false);
  state = nextFrame(state, text, true);
  const partialLength = state.visibleText.length;
  state = nextFrame(state, text, false);
  assert.ok(state.visibleText.length > partialLength && state.visibleText.length < text.length);
  for (let frame = 0; frame < 100 && state.visibleText !== text; frame += 1) {
    state = nextFrame(state, text, false);
  }
  assert.deepEqual(state, { visibleText: text, wasStreaming: false });
});

test("non-prefix corrections and reduced motion show the exact full text immediately", () => {
  const partial: StreamingTextState = { visibleText: "old partial", wasStreaming: true };
  assert.deepEqual(planStreamingTextUpdate(partial, "corrected final", false, false), {
    state: { visibleText: "corrected final", wasStreaming: false },
    onAnimationFrame: false,
  });
  assert.deepEqual(initialStreamingTextState("full text", true, true), {
    visibleText: "full text",
    wasStreaming: false,
  });
});

function nextFrame(state: StreamingTextState, text: string, streaming: boolean): StreamingTextState {
  const update = planStreamingTextUpdate(state, text, streaming, false);
  assert.equal(update.onAnimationFrame, true);
  return update.state;
}
