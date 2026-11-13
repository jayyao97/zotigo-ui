import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ConversationAnnotations } from "../src/conversation/ConversationAnnotations";

test("annotation Enter saves, while Shift+Enter and IME confirmation retain native editing", async () => {
  const dom = new JSDOM('<div id="root"></div><div id="conversation"><div data-message-id="m">quoted text</div></div>', { pretendToBeVisual: true, url: "http://localhost" });
  const rect = new dom.window.DOMRect(10, 150, 200, 40);
  dom.window.Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect = () => rect;
  const container = dom.window.document.querySelector<HTMLDivElement>("#conversation")!;
  container.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 800, 600);
  Object.defineProperty(container, "offsetParent", { value: dom.window.document.body });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  class Observer { observe() {} disconnect() {} }
  const globals = {
    window: dom.window, document: dom.window.document, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter,
    HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver, ResizeObserver: Observer,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const root = createRoot(document.querySelector("#root")!);
  const edits: (string | null)[] = [];
  const render = async (comment: string) => {
    await act(async () => root.render(<ConversationAnnotations root={{ current: container }} references={[{ id: "a", messageId: "m", text: "quoted text", comment }]} editingId="a" onEdit={id => edits.push(id)} onChange={() => { throw new Error("Saving must not change the comment"); }} />));
    return document.querySelector<HTMLTextAreaElement>(".annotation-editor textarea")!;
  };
  try {
    let textarea = await render("line one\nline two");
    assert.ok(textarea);
    edits.length = 0;
    for (const options of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const event = new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options });
      await act(async () => { textarea.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, false, JSON.stringify(options));
      assert.deepEqual(edits, [], "modified Enter and IME confirmation must not save");
    }
    for (const comment of ["line one\nline two", ""]) {
      textarea = await render(comment);
      edits.length = 0;
      const event = new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      await act(async () => { textarea.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(edits, [null]);
      assert.equal(textarea.value, comment);
    }
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
