import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SearchableSelect, type SearchableOption } from "../src/SearchableSelect";

// Its own file: React picks its change-event strategy for the first document it sees.
test("grouped options browse as a tree and search flat with their detail", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://zotigo.test", pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const tree: SearchableOption[] = [
    { value: "workspace_a", label: "WS", detail: "Workspace · Repro", group: "Repro" },
    { value: "sess_1", label: "hello", detail: "Session · WS", group: "Repro", depth: 1 },
    { value: "workspace_b", label: "Docs", detail: "Workspace · Notes", group: "Notes" },
  ];
  const root = createRoot(document.getElementById("root")!);
  const rows = () => [...document.querySelectorAll<HTMLElement>(".searchable-select-group, [role=\"option\"]")]
    .map(node => node.getAttribute("role") === "option" ? `${node.style.paddingLeft ? "  " : ""}${node.querySelector("strong")!.textContent}${node.querySelector("small") ? ` (${node.querySelector("small")!.textContent})` : ""}` : `# ${node.textContent}`);
  try {
    await act(async () => root.render(<SearchableSelect value="" options={tree} placeholder="Choose" searchPlaceholder="Search" emptyText="No matches" ariaLabel="Target" onChange={() => {}} />));
    await act(async () => document.querySelector<HTMLButtonElement>(".searchable-select-trigger")!.click());
    assert.deepEqual(rows(), ["# Repro", "WS", "  hello", "# Notes", "Docs"]);
    assert.equal([...document.querySelectorAll('[role="option"]')][1].getAttribute("aria-label"), "hello, Session · WS", "screen readers keep the context the tree shows");
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "hello");
      input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "x", bubbles: true }));
    });
    assert.deepEqual(rows(), ["# Repro", "hello (Session · WS)"]);
    await act(async () => root.unmount());
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});

test("browsing shows a few nested options per parent and reveals the rest", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://zotigo.test", pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const options: SearchableOption[] = [
    { value: "workspace_a", label: "WS", group: "Repro" },
    ...[1, 2, 3, 4, 5].map(n => ({ value: `sess_${n}`, label: `s${n}`, detail: "Session · WS", group: "Repro", depth: 1 })),
    { value: "workspace_b", label: "Docs", group: "Repro" },
  ];
  const root = createRoot(document.getElementById("root")!);
  const labels = () => [...document.querySelectorAll('[role="option"] strong')].map(node => node.textContent);
  const trigger = () => document.querySelector<HTMLButtonElement>(".searchable-select-trigger")!;
  const key = async (name: string) => act(async () => { document.querySelector('[role="combobox"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true })); });
  try {
    // The current choice stays visible even past the limit.
    await act(async () => root.render(<SearchableSelect value="sess_5" options={options} nestedLimit={2} moreText={count => `${count} more`} placeholder="Choose" searchPlaceholder="Search" emptyText="No matches" ariaLabel="Target" onChange={() => {}} />));
    await act(async () => trigger().click());
    assert.deepEqual(labels(), ["WS", "s1", "s2", "s5", "2 more", "Docs"]);
    // Enter on the reveal row shows the rest and keeps the list open.
    for (let step = 0; step < 1; step++) await key("ArrowDown");
    assert.equal(document.querySelector('[role="option"].is-active strong')?.textContent, "2 more");
    const descendant = () => document.querySelector('[role="combobox"]')!.getAttribute("aria-activedescendant");
    const before = descendant();
    await key("Enter");
    assert.deepEqual(labels(), ["WS", "s1", "s2", "s3", "s4", "s5", "Docs"]);
    // The first revealed option takes the place, under a new id screen readers announce.
    assert.equal(document.querySelector('[role="option"].is-active strong')?.textContent, "s3");
    assert.notEqual(descendant(), before);
    assert.equal(document.getElementById(descendant()!)?.querySelector("strong")?.textContent, "s3");
    // Reopening starts collapsed again.
    await key("Escape");
    await act(async () => trigger().click());
    assert.deepEqual(labels(), ["WS", "s1", "s2", "s5", "2 more", "Docs"]);
    await act(async () => root.unmount());
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
