import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchableSelect, type SearchableOption } from "../src/SearchableSelect";

const options: SearchableOption[] = [
  { value: "repo-gateway", label: "chat_gateway", detail: "git@example.com:org/chat_gateway.git", keywords: ["/src/chat_gateway"] },
  { value: "repo-tools", label: "tools_agent", detail: "/src/tools_agent" },
  { value: "repo-memory", label: "chat_memory", detail: "/src/chat_memory" },
  { value: "folder-notes", label: "notes", detail: "/src/notes" },
];

test("the search lives in the menu, filters by name, detail and keywords, and chooses by keyboard or pointer", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://zotigo.test", pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const chosen: string[] = [];
  function Harness() {
    const [value, setValue] = useState("");
    return <SearchableSelect value={value} options={options} placeholder="Choose a source" searchPlaceholder="Search sources" emptyText="No matches" ariaLabel="Project source"
      onChange={next => { chosen.push(next); setValue(next); }} />;
  }
  const root = createRoot(document.getElementById("root")!);
  const trigger = () => document.querySelector<HTMLButtonElement>(".searchable-select-trigger")!;
  const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]');
  const labels = () => [...document.querySelectorAll('[role="option"] strong')].map(node => node.textContent);
  const type = async (text: string) => act(async () => {
    const input = search()!;
    // Bypass React's value tracker; its legacy change polyfill notices on keydown.
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "x", bubbles: true }));
  });
  const key = async (name: string) => act(async () => { search()!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true })); });
  try {
    await act(async () => root.render(<Harness />));
    assert.equal(trigger().textContent, "Choose a source");
    assert.equal(search(), null, "the search field only exists inside the open menu");

    await act(async () => trigger().click());
    assert.equal(document.activeElement, search(), "opening focuses the search");
    assert.deepEqual(labels(), ["chat_gateway", "tools_agent", "chat_memory", "notes"]);

    await type("chat");
    assert.deepEqual(labels(), ["chat_gateway", "chat_memory"]);
    await type("org/chat");
    assert.deepEqual(labels(), ["chat_gateway"], "the detail is searchable");
    await type("/src/chat_gateway");
    assert.deepEqual(labels(), ["chat_gateway"], "keywords are searchable");
    await type("nothing");
    assert.equal(document.querySelector(".searchable-select-options p")?.textContent, "No matches");

    await type("chat");
    await key("ArrowDown");
    await key("Enter");
    assert.deepEqual(chosen, ["repo-memory"]);
    assert.equal(search(), null, "choosing closes the menu");
    assert.equal(document.activeElement, trigger(), "focus returns to the trigger");
    assert.match(trigger().textContent!, /chat_memory/);

    await act(async () => trigger().click());
    assert.equal(search()!.value, "", "reopening starts a new search");
    assert.equal(document.querySelector('[role="option"].is-active strong')?.textContent, "chat_memory", "reopening starts at the current choice");
    await key("Escape");
    assert.equal(search(), null);
    assert.deepEqual(chosen, ["repo-memory"], "Escape does not choose");

    await act(async () => trigger().click());
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.includes("notes"))!.click());
    assert.deepEqual(chosen, ["repo-memory", "folder-notes"]);

    await act(async () => trigger().click());
    await act(async () => { document.body.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })); });
    assert.equal(search(), null, "a pointer outside closes the menu");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
