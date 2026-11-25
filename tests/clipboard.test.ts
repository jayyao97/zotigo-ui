import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { copyText } from "../src/clipboard";

function installDom(clipboard?: { writeText(text: string): Promise<void> }, copySucceeds = true) {
  const dom = new JSDOM("<!doctype html><html><body><button id=origin>Copy</button></body></html>", { url: "http://zotigo.example:18944/" });
  if (clipboard) Object.defineProperty(dom.window.navigator, "clipboard", { value: clipboard });
  const copied: string[] = [];
  dom.window.document.execCommand = ((command: string) => {
    const active = dom.window.document.activeElement as HTMLTextAreaElement;
    if (command === "copy" && active?.tagName === "TEXTAREA") copied.push(active.value.slice(active.selectionStart, active.selectionEnd));
    return command === "copy" && copySucceeds;
  }) as typeof dom.window.document.execCommand;
  const replacements = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  return { dom, copied, restore: () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  } };
}

test("copyText uses the Clipboard API when the browser provides it", async () => {
  const written: string[] = [];
  const { copied, restore } = installDom({ writeText: async (text) => { written.push(text); } });
  try {
    await copyText("sess_1");
    assert.deepEqual(written, ["sess_1"]);
    assert.deepEqual(copied, []);
  } finally { restore(); }
});

test("copyText falls back on plain HTTP and restores focus", async () => {
  const { dom, copied, restore } = installDom();
  try {
    const origin = dom.window.document.querySelector<HTMLButtonElement>("#origin")!;
    origin.focus();
    await copyText("workspace_1");
    assert.deepEqual(copied, ["workspace_1"]);
    assert.equal(dom.window.document.querySelector("textarea"), null);
    assert.equal(dom.window.document.activeElement, origin);
  } finally { restore(); }
});

test("copyText falls back when the Clipboard API rejects", async () => {
  const { copied, restore } = installDom({ writeText: async () => { throw new Error("Document is not focused."); } });
  try {
    await copyText("sess_2");
    assert.deepEqual(copied, ["sess_2"]);
  } finally { restore(); }
});

test("copyText rejects when the browser copies nothing", async () => {
  const { dom, restore } = installDom(undefined, false);
  try {
    await assert.rejects(copyText("sess_3"), /Clipboard unavailable/);
    assert.equal(dom.window.document.querySelector("textarea"), null);
  } finally { restore(); }
});
