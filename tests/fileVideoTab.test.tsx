import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { FileVideoTab } from "../src/FileVideoTab";

test("hidden video pauses, stays paused when reopened and releases its blob on close", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const globals = { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  let pauses = 0;
  dom.window.HTMLMediaElement.prototype.pause = () => { pauses++; };
  const root = createRoot(document.getElementById("root")!);
  const file = { path: "/workspace/clip.mp4", name: "clip.mp4", mediaType: "video/mp4", dataBase64: "AAAAFGZ0eXBpc29t", sizeBytes: 12, mtimeMs: 1 };
  let unmounted = false;
  try {
    await act(async () => root.render(<FileVideoTab file={file} active onRefresh={() => {}} />));
    const video = document.querySelector("video")!;
    const source = video.src;
    assert.ok(source.startsWith("blob:"));
    assert.equal(pauses, 0);
    await act(async () => root.render(<FileVideoTab file={file} active={false} onRefresh={() => {}} />));
    assert.equal(pauses, 1);
    await act(async () => root.render(<FileVideoTab file={file} active onRefresh={() => {}} />));
    assert.equal(document.querySelector("video"), video);
    assert.equal(video.autoplay, false);
    assert.equal(pauses, 1);
    await act(async () => root.unmount()); unmounted = true;
    await assert.rejects(fetch(source));
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
