import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AccountMenu, HostContext } from "../src/HostShell";

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
    const root = createRoot(document.querySelector("#root")!);
    const render = (signOut: boolean) => root.render(<HostContext.Provider value={{ profiles: [], selected: "local", busy: false, switchHost: () => {}, settings: () => calls.push("settings") }}>
      <AccountMenu status="Online" onSignOut={signOut ? () => calls.push("sign out") : undefined} />
    </HostContext.Provider>);
    await act(async () => render(true));
    const trigger = document.querySelector<HTMLButtonElement>(".account-menu-trigger")!;
    assert.match(trigger.textContent ?? "", /Zotigo.*Online/);
    await act(async () => trigger.click());
    const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    assert.deepEqual(items().map((item) => item.querySelector("span")?.textContent), ["Settings", "Sign out"]);
    assert.equal(document.activeElement, items()[0], "opening focuses the first item");
    await act(async () => key(items()[0], "ArrowDown"));
    assert.equal(document.activeElement, items()[1]);
    await act(async () => key(items()[1], "Escape"));
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, trigger, "Escape returns focus to the trigger");

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
