import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HostSettings } from "../src/HostSettings";
import type { ClientApi } from "../shared/clientTypes";
import type { HostInput, HostProfile } from "../shared/hosts";

test("connection settings edit existing profiles and guard deletion with a successful switch", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://zotigo.test" });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  let profiles: HostProfile[] = [
    { id: "local", name: "Local", baseUrl: "http://127.0.0.1:8766", hasToken: false },
    { id: "remote", name: "Remote", baseUrl: "https://remote.example", hasToken: true },
  ];
  const saved: HostInput[] = [];
  const deleted: string[] = [];
  const discarded: string[] = [];
  let allowSwitch = false;
  let switchCount = 0;
  const api = {
    listHosts: async () => profiles,
    saveHost: async (input: HostInput) => { saved.push(input); return profiles[1]; },
    deleteHost: async (id: string) => { deleted.push(id); profiles = profiles.filter((host) => host.id !== id); },
  } as unknown as ClientApi;
  const render = async () => { await act(async () => root.render(<HostSettings api={api} kind="desktop" profiles={profiles} selected="remote" busy={false} status="" onProfiles={(next) => { profiles = next; }} onClose={() => {}} beforeChange={async () => { switchCount++; return allowSwitch; }} onDiscard={(id) => discarded.push(id)} />)); };
  const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const submit = async () => { await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); };
  try {
    await render();
    assert.equal(document.querySelector("form"), null, "list does not show a form");
    const action = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("footer button")].find((item) => item.textContent === label)!;
    await act(async () => action("Add host").click());
    assert.ok(document.querySelector("form"));
    assert.equal(document.querySelector(".host-settings-list"), null);
    await act(async () => action("Cancel").click());
    assert.equal(document.querySelector("form"), null);
    assert.equal(button("Edit Local").disabled, true);
    assert.equal(button("Remove Local").disabled, true);
    assert.equal(button("Remove Remote").disabled, false);
    await act(async () => button("Edit Remote").click());
    assert.equal(document.querySelector(".host-settings-list"), null, "editing is a separate view");
    const inputs = document.querySelectorAll<HTMLInputElement>("form input");
    assert.equal(inputs[0].value, "Remote");
    assert.equal(inputs[1].value, "https://remote.example");
    assert.equal(inputs[2].value, "");
    assert.match(inputs[2].placeholder, /keep/);
    await submit();
    assert.equal(saved[0].id, "remote");
    assert.equal(saved[0].token, undefined);
    assert.equal(switchCount, 0, "unchanged credentials do not switch hosts");
    await act(async () => button("Edit Remote").click());
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await submit();
    assert.equal(saved.length, 1, "cancelled switch prevents credential edits");
    allowSwitch = true;
    await submit();
    assert.equal(saved[1].token, "", "explicit removal clears the token");
    assert.deepEqual(discarded, ["remote"]);
    allowSwitch = false;
    await act(async () => button("Remove Remote").click());
    assert.equal(deleted.length, 0, "deletion needs confirmation");
    assert.equal(document.querySelector("form"), null, "confirmation does not show the add form");
    assert.equal(document.querySelector(".host-settings-list"), null, "confirmation is separate from the list");
    await act(async () => action("Cancel").click());
    assert.equal(deleted.length, 0);
    assert.ok(document.querySelector(".host-settings-list"));
    await act(async () => button("Remove Remote").click());
    const confirm = () => action("Delete connection");
    await act(async () => confirm().click());
    assert.equal(deleted.length, 0, "cancelled switch preserves the connection");
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Could not switch/);
    allowSwitch = true;
    await act(async () => confirm().click());
    await render();
    assert.deepEqual(deleted, ["remote"]);
    assert.equal(button("Remove Remote"), null);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
