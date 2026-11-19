import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { SelectionTools } from "../src/conversation/ConversationTools";

test("switching transcripts or hiding the panel dismisses translations, including pending responses", async () => {
  const dom = new JSDOM('<main></main><div id="session"><p data-message-id="one">Session text</p></div><div id="child"><p data-message-id="two">Child text</p></div>', { pretendToBeVisual: true });
  const { document } = dom.window;
  dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect(10, 150, 200, 20);
  const globals = {
    window: dom.window, document, ResizeObserver: class { observe() {} disconnect() {} },
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.querySelector("main")!);
  const session = { current: document.querySelector<HTMLDivElement>("#session")! };
  const child = { current: document.querySelector<HTMLDivElement>("#child")! };
  const select = async (element: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(element.querySelector("p")!.firstChild!);
    const selection = dom.window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    await act(async () => {
      document.dispatchEvent(new dom.window.Event("selectionchange"));
      await new Promise(resolve => setTimeout(resolve, 180));
    });
  };
  let finish!: (result: { text: string }) => void;
  const options = { language: "en" as const, translationProfile: "", translate: () => new Promise<{ text: string }>(resolve => { finish = resolve; }) };
  const render = (visible: boolean) => act(async () => root.render(<>
    <SelectionTools root={session} {...options} />
    {visible && <SelectionTools root={child} {...options} />}
  </>));
  const clickTranslate = () => act(async () => {
    const button = document.querySelector<HTMLButtonElement>(".selection-actions button")!;
    button.focus();
    button.click();
  });
  try {
    await render(true);
    await select(session.current);
    await clickTranslate();
    await act(async () => finish({ text: "Session translation" }));
    assert.equal(document.querySelector(".selection-translation p")?.textContent, "Session translation");
    await select(child.current);
    assert.equal(document.querySelectorAll(".selection-tools").length, 1);
    assert.equal(document.querySelector(".selection-translation"), null);
    await clickTranslate();
    await render(false);
    assert.equal(document.querySelector(".selection-tools"), null);
    await render(true);
    await act(async () => finish({ text: "Late child translation" }));
    assert.equal(document.querySelector(".selection-tools"), null);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
