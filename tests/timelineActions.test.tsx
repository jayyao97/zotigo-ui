import assert from "node:assert/strict";
import test from "node:test";
import { act, memo } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useTimelineActions } from "../src/conversation/useTimelineActions";

test("typing skips memoized timeline rendering while actions use the current selection", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  let renders = 0;
  const calls: string[] = [];
  const Timeline = memo(function Timeline(actions: ReturnType<typeof useTimelineActions>) {
    renders++;
    return <><button id="fork" onClick={() => actions.onFork("turn-a")}>Fork</button>
      <button id="source" disabled={!actions.onOpenForkSource} onClick={() => actions.onOpenForkSource?.("source-a")}>Source</button></>;
  });
  function Composer({ prompt, selection, hasSource = true }: { prompt: string; selection: string; hasSource?: boolean }) {
    const actions = useTimelineActions({
      onFork: (turn) => { calls.push(`${selection}:${turn}`); },
      onOpenForkSource: hasSource ? (source) => { calls.push(`${selection}:${source}`); } : undefined,
    });
    return <><textarea value={prompt} readOnly /><Timeline {...actions} /></>;
  }
  try {
    await act(async () => root.render(<Composer prompt="" selection="first" />));
    for (const prompt of ["a", "ab", "你好", "你好\nsecond line"]) {
      await act(async () => root.render(<Composer prompt={prompt} selection="first" />));
    }
    assert.equal(renders, 1);
    await act(async () => root.render(<Composer prompt="new draft" selection="second" />));
    await act(async () => {
      document.getElementById("fork")!.click();
      document.getElementById("source")!.click();
    });
    assert.deepEqual(calls, ["second:turn-a", "second:source-a"]);
    await act(async () => root.render(<Composer prompt="" selection="second" hasSource={false} />));
    assert.equal(document.querySelector<HTMLButtonElement>("#source")!.disabled, true);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
