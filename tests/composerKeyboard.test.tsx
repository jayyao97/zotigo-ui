import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { handleComposerKeyDown } from "../src/composerKeyboard";

test("IME candidate confirmation never submits or selects a skill; the next Enter still submits", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let submissions = 0;
  let skillKeys = 0;
  let skillMenuOpen = false;
  try {
    await act(async () => root.render(<form onSubmit={(event) => { event.preventDefault(); submissions++; }}>
      <textarea defaultValue="中文草稿" onKeyDown={(event) => handleComposerKeyDown(event, () => { skillKeys++; return skillMenuOpen; })} />
    </form>));
    const textarea = document.querySelector("textarea")!;
    const key = async (init: KeyboardEventInit) => {
      const event = new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      await act(async () => { textarea.dispatchEvent(event); });
      return event;
    };
    assert.equal((await key({ key: "Enter", isComposing: true, keyCode: 13 })).defaultPrevented, false);
    textarea.dispatchEvent(new dom.window.CompositionEvent("compositionend", { bubbles: true, data: "中文" }));
    assert.equal((await key({ key: "Enter", isComposing: false, keyCode: 229 })).defaultPrevented, false);
    await key({ key: "ArrowDown", isComposing: false, keyCode: 229 });
    assert.equal(submissions, 0);
    assert.equal(skillKeys, 0);
    assert.equal(textarea.value, "中文草稿");
    assert.equal((await key({ key: "Enter", shiftKey: true, keyCode: 13 })).defaultPrevented, false);
    assert.equal(submissions, 0);
    assert.equal((await key({ key: "Enter", keyCode: 13 })).defaultPrevented, true);
    assert.equal(submissions, 1);
    skillMenuOpen = true;
    await key({ key: "Enter", keyCode: 13 });
    assert.equal(submissions, 1);
    assert.equal(skillKeys, 3);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
