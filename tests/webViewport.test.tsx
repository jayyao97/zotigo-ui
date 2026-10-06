import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useWebViewport } from "../src/web/useWebViewport";

test("Web viewport follows keyboard resize and pan without overriding pinch zoom", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const viewport = Object.assign(new dom.window.EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  Object.defineProperty(dom.window, "visualViewport", { value: viewport });
  const previous = Object.fromEntries(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  function App() { useWebViewport(); return null; }
  try {
    await act(async () => root.render(<App />));
    const style = document.documentElement.style;
    assert.equal(style.getPropertyValue("--web-viewport-height"), "844px");
    viewport.height = 420; viewport.offsetTop = 24;
    viewport.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(style.getPropertyValue("--web-viewport-height"), "420px");
    assert.equal(style.getPropertyValue("--web-viewport-top"), "24px");
    viewport.scale = 2; viewport.height = 210;
    viewport.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(style.getPropertyValue("--web-viewport-height"), "420px");
    viewport.scale = 1; viewport.height = 844; viewport.offsetTop = 0;
    viewport.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(style.getPropertyValue("--web-viewport-height"), "844px");
    await act(async () => root.unmount());
    assert.equal(style.getPropertyValue("--web-viewport-height"), "");
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
