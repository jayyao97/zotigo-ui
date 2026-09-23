import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownCodeBlock } from "../src/MarkdownCodeBlock";
import * as renderer from "../src/renderMermaid";

test("only Mermaid fences use diagram rendering", () => {
  assert.match(renderToStaticMarkup(<MarkdownCodeBlock><code className="language-mermaid">flowchart LR; A--&gt;B</code></MarkdownCodeBlock>), /mermaid-code-block/);
  assert.doesNotMatch(renderToStaticMarkup(<MarkdownCodeBlock><code className="language-markdown">flowchart LR; A--&gt;B</code></MarkdownCodeBlock>), /mermaid-code-block/);
});

test("diagram preview preserves source, rejects stale stream results and releases image URLs", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const pending: Array<{code: string; resolve: (svg: string) => void; reject: () => void}> = [];
  const render = mock.method(renderer, "renderMermaid", (code: string) => new Promise<string>((resolve, reject) => pending.push({ code, resolve, reject: () => reject(new Error("invalid")) })));
  const urls: string[] = [], revoked: string[] = [], copied: string[] = [];
  const create = mock.method(URL, "createObjectURL", () => { const url = `blob:diagram-${urls.length}`; urls.push(url); return url; });
  const revoke = mock.method(URL, "revokeObjectURL", (url: string) => revoked.push(url));
  Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async (value: string) => { copied.push(value); } } });
  const root = createRoot(document.getElementById("root")!);
  const show = async (code: string) => act(async () => root.render(<MarkdownCodeBlock><code className="language-mermaid">{code}</code></MarkdownCodeBlock>));
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  const click = async (label: string) => act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
  try {
    await show("flowchart LR\nA-->B"); await settle();
    assert.equal(pending.length, 1);
    assert.match(document.querySelector("pre")!.textContent!, /A-->B/);
    await act(async () => pending[0].resolve("<svg/>"));
    assert.equal(document.querySelector("img")?.getAttribute("src"), urls[0]);
    await click("Show source");
    assert.match(document.querySelector("pre")!.textContent!, /A-->B/);
    await click("Copy diagram source");
    assert.deepEqual(copied, ["flowchart LR\nA-->B"]);
    await click("Show diagram");
    assert.ok(document.querySelector("img"));
    await show("flowchart LR\nA-->"); await settle();
    assert.deepEqual(revoked, [urls[0]]);
    await show("flowchart LR\nA-->C"); await settle();
    await act(async () => pending[1].resolve("<svg/>"));
    assert.equal(document.querySelector("img"), null);
    assert.equal(urls.length, 1);
    await act(async () => pending[2].reject());
    assert.match(document.querySelector('[role="status"]')!.textContent!, /incomplete or invalid/);
    assert.match(document.querySelector("pre")!.textContent!, /A-->C/);
    await click("Retry diagram"); await settle();
    await act(async () => pending[3].resolve("<svg/>"));
    assert.ok(document.querySelector("img"));
    await act(async () => root.unmount());
    assert.deepEqual(revoked, urls);
  } finally {
    await act(async () => root.unmount());
    render.mock.restore(); create.mock.restore(); revoke.mock.restore();
    for (const [key, value] of Object.entries(previous)) {
      if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
