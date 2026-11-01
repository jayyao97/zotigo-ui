import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { UpdateSettings } from "../src/UpdateSettings";
import { ClientContext } from "../src/ClientContext";
import type { ClientApi } from "../shared/clientTypes";
import { parseUpdateRequest, parseUpdateStatus, type UpdateStatus } from "../shared/updates";

const status: UpdateStatus = { component: "daemon", version: "0.0.4-dev.29", commit: "abc", custom: false, channel: "development", checked_at: new Date().toISOString(), phase: "idle" };

test("published UI manifest matches its version and unsupported RPC inputs fail", () => {
  const manifest = JSON.parse(fs.readFileSync("update.json", "utf8"));
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(manifest.version, pkg.version);
  if (process.env.GITHUB_REF?.startsWith("refs/tags/v")) assert.equal(process.env.GITHUB_REF.slice("refs/tags/v".length), manifest.version);
  assert.equal(manifest.update_protocol, 1);
  assert.throws(() => parseUpdateRequest("shell", "stable"));
  assert.throws(() => parseUpdateRequest("channel", "master"));
  assert.throws(() => parseUpdateRequest({ toString: () => "apply" }));
  assert.throws(() => parseUpdateStatus({ ...status, phase: "unknown" }));
});

test("channels are per component, changing one only checks releases, and old host responses cannot replace the new host", async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: "https://zotigo.test"});
  const globals = {window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true};
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const calls: Array<[string, string, string | undefined]> = [];
  let pending: ((s: UpdateStatus) => void) | undefined;
  let deferStatus = false;
  const api = { updateComponent: async (target: string, action: string, channel?: string) => {
    calls.push([target, action, channel]);
    if (deferStatus && target === "daemon") return new Promise<UpdateStatus>(resolve => { pending = resolve; });
    return { ...status, component: target === "client" ? "desktop" : "daemon", channel: channel ?? "development", phase: action === "status" ? "completed" : "idle", checked_at: action === "status" ? new Date(0).toISOString() : status.checked_at };
  }} as unknown as ClientApi;
  const root = createRoot(document.getElementById("root")!);
  const render = (host: string, client = api) => root.render(<ClientContext.Provider value={{api: client, kind: "desktop"}}><UpdateSettings hostName={host}/></ClientContext.Provider>);
  try {
    await act(async () => render("remote-a"));
    assert.match(document.body.textContent!, /Daemon · remote-a/);
    assert.ok(calls.some(([target, action]) => target === "client" && action === "check"), "a completed update must not disable future checks");
    assert.ok(calls.some(([target, action]) => target === "daemon" && action === "check"));
    const select = document.querySelectorAll("select")[1];
    await act(async () => { select.value = "stable"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.deepEqual(calls.slice(-2), [["daemon", "channel", "stable"], ["daemon", "check", undefined]]);
    assert.ok(!calls.some(([, action]) => action === "prepare" || action === "apply"));
    deferStatus = true;
    await act(async () => render("remote-b"));
    assert.ok(pending);
    const nextApi = { updateComponent: async () => ({...status, version: "9.0.0", channel: "stable"}) } as unknown as ClientApi;
    await act(async () => render("remote-c", nextApi));
    await act(async () => pending!({...status, version: "stale-version"}));
    assert.match(document.body.textContent!, /9.0.0/);
    assert.doesNotMatch(document.body.textContent!, /stale-version/);
    const readyApi = { updateComponent: async (target: string, action: string) => {
      calls.push([target, action, undefined]);
      return {...status, component: target === "client" ? "desktop" : "daemon", phase: "ready", target: {version: "9.0.1", commit: "next"}};
    }} as unknown as ClientApi;
    await act(async () => render("remote-c", readyApi));
    const veto = (event: Event) => event.preventDefault();
    window.addEventListener("zotigo:before-update", veto);
    let confirmations = 0;
    window.confirm = () => { confirmations++; return false; };
    const restart = document.querySelector("section button") as HTMLButtonElement;
    await act(async () => restart.click());
    assert.equal(confirmations, 1, "unsaved work must require confirmation before restarting");
    assert.ok(!calls.some(([, action]) => action === "apply"));
    window.confirm = () => { confirmations++; return true; };
    await act(async () => restart.click());
    assert.equal(confirmations, 2);
    assert.ok(calls.some(([target, action]) => target === "client" && action === "apply"));
    window.removeEventListener("zotigo:before-update", veto);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
