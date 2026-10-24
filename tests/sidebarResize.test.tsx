import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SidebarResizeHandle, loadSidebarWidth } from "../src/SidebarResizeHandle";

test("sidebar resizing clamps, persists across connections, resets and releases capture", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  let measure = () => {};
  let frameWidth = 1200;
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class {
      constructor(callback: () => void) { measure = callback; }
      observe() {}
      disconnect() {}
    } };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { get: () => frameWidth });
  let captured = false;
  dom.window.HTMLElement.prototype.setPointerCapture = () => { captured = true; };
  dom.window.HTMLElement.prototype.hasPointerCapture = () => captured;
  dom.window.HTMLElement.prototype.releasePointerCapture = () => { captured = false; };
  let resizing = false;
  function Harness() {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(loadSidebarWidth);
    return <div ref={ref}><SidebarResizeHandle frameRef={ref} width={width} onWidth={setWidth} onResizing={value => { resizing = value; }} /></div>;
  }
  const root = createRoot(document.getElementById("root")!);
  const handle = () => document.querySelector('[role="separator"]')!;
  const value = () => Number(handle().getAttribute("aria-valuenow"));
  const pointer = async (type: string, x: number) => {
    await act(async () => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      handle().dispatchEvent(event);
    });
  };
  const key = async (key: string) => {
    await act(async () => { handle().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })); });
  };
  try {
    await act(async () => root.render(<Harness key="a" />));
    assert.equal(value(), 320);
    await pointer("pointerdown", 318);
    await pointer("pointermove", 2000);
    assert.equal(value(), 480);
    assert.equal(resizing, true);
    await pointer("pointerup", 2000);
    assert.equal(resizing, false);
    assert.equal(captured, false);
    assert.equal(localStorage.getItem("zotigo:sidebar-width"), "480");
    await key("Home");
    assert.equal(value(), 240);
    await key("ArrowLeft");
    assert.equal(value(), 240);
    await key("ArrowRight");
    assert.equal(value(), 256);
    await act(async () => root.render(<Harness key="b" />));
    assert.equal(value(), 256, "switching hosts retains the UI width across remounts");
    await act(async () => root.render(<Harness key="a" />));
    assert.equal(value(), 256, "returning to a host uses the same UI width");
    await act(async () => root.render(<Harness key="reload" />));
    assert.equal(value(), 256, "reopening the UI restores the global preference");
    await act(async () => { handle().dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true })); });
    assert.equal(value(), 320);
    await key("End");
    frameWidth = 800;
    await act(async () => measure());
    assert.equal(value(), 380);
    assert.equal(localStorage.getItem("zotigo:sidebar-width"), "480", "window resize preserves the preferred width");
    frameWidth = 1200;
    await act(async () => measure());
    assert.equal(value(), 480);
    await pointer("pointerdown", 478);
    await pointer("pointermove", 300);
    await pointer("pointercancel", 300);
    assert.equal(resizing, false);
    await pointer("pointermove", 1000);
    assert.equal(value(), 302, "canceled pointer cannot keep resizing");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
