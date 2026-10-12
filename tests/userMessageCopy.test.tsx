import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { UserMessage } from "../src/conversation/ConversationTimeline";

test("user copy preserves the complete source text and reports clipboard failures", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const copied: string[] = [];
  let fail = false;
  const replacements = {
    window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} },
    navigator: { clipboard: { writeText: async (text: string) => {
      if (fail) throw new Error("denied");
      copied.push(text);
    } } },
  };
  const previous = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  const text = "**完整 query**\n" + "A long paragraph.\n".repeat(20);
  try {
    await act(async () => root.render(<UserMessage text={text} />));
    const copy = document.querySelector<HTMLButtonElement>('[aria-label="Copy message"]')!;
    await act(async () => copy.click());
    assert.deepEqual(copied, [text]);
    assert.equal(document.querySelector('[role="status"]')?.textContent, "Copied");
    fail = true;
    await act(async () => copy.click());
    assert.equal(document.querySelector('[role="status"]')?.textContent, "Could not copy message");
    await act(async () => root.render(<UserMessage text="" attachments={<img alt="Attachment" />} />));
    assert.equal(document.querySelector('[aria-label="Copy message"]'), null);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
