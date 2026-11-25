import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AccountMenu } from "../src/sidebar/AccountMenu";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", { pretendToBeVisual: true });
  const replacements = { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
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

const key = (target: Element, value: string) => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true }));

test("the sidebar account menu opens settings and signs out", async () => {
  const restore = installDom();
  try {
    const calls: string[] = [];
    const escapes: string[] = [];
    const root = createRoot(document.querySelector("#root")!);
    // The narrow Web drawer closes on an Escape that reaches it.
    const render = (signOut: boolean) => root.render(<main onKeyDown={(event) => { if (event.key === "Escape") escapes.push("drawer"); }}>
      <AccountMenu status="Online" onOpenSettings={() => calls.push("settings")} onSignOut={signOut ? () => calls.push("sign out") : undefined} />
    </main>);
    await act(async () => render(true));
    const trigger = document.querySelector<HTMLButtonElement>(".account-menu-trigger")!;
    assert.equal(trigger.getAttribute("aria-label"), null, "the visible name and status name the button");
    assert.match(trigger.textContent ?? "", /Zotigo.*Online/);
    await act(async () => trigger.click());
    const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    assert.deepEqual(items().map((item) => item.querySelector("span")?.textContent), ["Settings", "Sign out"]);
    assert.ok(items().every((item) => item.tabIndex === -1), "arrow keys, not Tab, move between items");
    assert.equal(document.activeElement, items()[0], "opening focuses the first item");
    await act(async () => key(items()[0], "ArrowDown"));
    assert.equal(document.activeElement, items()[1]);
    await act(async () => key(items()[1], "Escape"));
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, trigger, "Escape returns focus to the trigger");
    assert.deepEqual(escapes, [], "Escape closes only the menu");

    await act(async () => trigger.click());
    await act(async () => key(items()[0], "Tab"));
    assert.equal(document.querySelector('[role="menu"]'), null, "Tab leaves and closes the menu");

    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(document.querySelector('[role="menu"]'), null, "pressing outside closes the menu");

    await act(async () => trigger.click());
    await act(async () => items()[0].click());
    await act(async () => trigger.click());
    await act(async () => items()[1].click());
    assert.deepEqual(calls, ["settings", "sign out"]);

    // Desktop has no sign-out; Settings remains.
    await act(async () => render(false));
    await act(async () => trigger.click());
    assert.deepEqual(items().map((item) => item.querySelector("span")?.textContent), ["Settings"]);
    await act(async () => root.unmount());
  } finally { restore(); }
});
