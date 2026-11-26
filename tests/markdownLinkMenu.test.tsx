import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { MarkdownLinkMenu, markdownLinkMenuTarget, type LinkMenuState } from "../src/MarkdownLinkMenu";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div class=markdown-copy><p><a id=web href='https://example.com/docs'>docs</a> <a id=file href='notes/My%20Plan.md#L12'>plan</a> <a id=anchor href='#top'>top</a> <a href='https://example.com/big'><button class=image-preview-trigger><img id=img src='x.png'></button></a></p><div id=scroller style='overflow:auto'><p id=other>other</p></div></div><div id=root></div></body></html>", { pretendToBeVisual: true });
  const replacements = { window: dom.window, document: dom.window.document, Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  return () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  };
}

const at = (id: string) => ({ target: document.getElementById(id)!, clientX: 40, clientY: 50 });

test("right-clicking a Markdown link offers it; anchors and other text keep the system menu", () => {
  const restore = installDom();
  try {
    assert.equal(markdownLinkMenuTarget(at("web"))?.copy, "https://example.com/docs");
    assert.equal(markdownLinkMenuTarget(at("file"))?.copy, "notes/My Plan.md:12");
    assert.equal(markdownLinkMenuTarget(at("anchor")), null);
    assert.equal(markdownLinkMenuTarget(at("root")), null);
    assert.equal(markdownLinkMenuTarget(at("img")), null, "a linked image keeps its image menu");
    // Text selected elsewhere does not matter; a selection covering the link does.
    window.getSelection()!.selectAllChildren(document.getElementById("other")!);
    assert.equal(markdownLinkMenuTarget(at("web"))?.copy, "https://example.com/docs");
    window.getSelection()!.selectAllChildren(document.getElementById("web")!);
    assert.equal(markdownLinkMenuTarget(at("web")), null);
    window.getSelection()!.removeAllRanges();
  } finally { restore(); }
});

test("the link menu opens the link like a click and copies it", async () => {
  const restore = installDom();
  try {
    const link = document.getElementById("web") as HTMLAnchorElement;
    let opened = 0;
    link.addEventListener("click", (event) => { event.preventDefault(); opened++; });
    const copied: string[] = [];
    let closed = 0;
    const menu = markdownLinkMenuTarget(at("web")) as LinkMenuState;
    const root = createRoot(document.getElementById("root")!);
    await act(async () => root.render(<MarkdownLinkMenu menu={menu} onClose={() => closed++} onCopy={(text) => copied.push(text)} />));
    const item = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent === label)!;
    assert.equal(document.activeElement, item("Open link"), "keyboard focus starts on the menu");
    await act(async () => item("Copy link").click());
    await act(async () => item("Open link").click());
    assert.deepEqual(copied, ["https://example.com/docs"]);
    assert.equal(opened, 1);
    assert.equal(closed, 2);
    // A scroll elsewhere (streaming output) leaves the menu open; one moving the link closes it.
    await act(async () => { document.getElementById("scroller")!.dispatchEvent(new window.Event("scroll")); });
    assert.equal(closed, 2);
    await act(async () => { document.querySelector(".markdown-copy")!.dispatchEvent(new window.Event("scroll")); });
    assert.equal(closed, 3);
    await act(async () => { window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })); });
    assert.equal(closed, 4);
    assert.equal(document.activeElement, link, "Escape returns focus to the link");
    await act(async () => root.unmount());
  } finally { restore(); }
});
