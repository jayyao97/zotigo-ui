import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { UpdateSettings } from "../src/UpdateSettings";
import { bindClientGeneration } from "../shared/bindClientGeneration";
import { SettingsPage } from "../src/SettingsPage";
import { ClientContext } from "../src/ClientContext";
import type { ClientApi } from "../shared/clientTypes";
import { parseUpdateRequest, parseUpdateStatus, type UpdateStatus } from "../shared/updates";

const status: UpdateStatus = { component: "daemon", version: "0.0.4-dev.29", commit: "abc", custom: false, channel: "development", checked_at: new Date().toISOString(), phase: "idle" };

test("settings select model hosts independently and run an update from one fixed action", async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: "https://zotigo.test"});
  const globals = {window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true};
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, {value, configurable:true});
  const hosts = [{id:"local",name:"Local",baseUrl:"http://localhost:8766",hasToken:true}, {id:"remote",name:"Remote",baseUrl:"https://remote.test",hasToken:true}];
  const modelHosts: Array<string | undefined> = [];
  const updates: Array<[string, string, string | undefined]> = [];
  let prepared = false;
  let applied = false;
  const api = {
    listHosts: async () => hosts,
    getModelSettings: async (hostId?: string) => {modelHosts.push(hostId); return {revision:"r",default_profile:"",profiles:[]};},
    setActiveHost: async () => {throw new Error("Settings must not switch the workbench host");},
    updateComponent: async (target: string, action: string, _channel?: string, hostId?: string) => {
      updates.push([target,action,hostId]);
      if (hostId !== "remote") return status;
      if (action === "prepare") {prepared = true; return {...status,phase:"preparing",target:{version:"1.0.0",commit:"next"}};}
      if (action === "apply") {applied = true; return {...status,version:"1.0.0",phase:"completed"};}
      return {...status, phase:applied ? "completed" : prepared ? "ready" : "idle", ...(applied ? {} : {target:{version:"1.0.0",commit:"next"}})};
    },
  } as unknown as ClientApi;
  const root = createRoot(document.getElementById("root")!);
  let workbenchCurrent = true;
  const workbenchApi = bindClientGeneration(api, () => workbenchCurrent);
  const render = (visibleHosts = hosts) => root.render(<ClientContext.Provider value={{api:workbenchApi,kind:"desktop"}}><SettingsPage updateApi={api} hosts={visibleHosts} initialPage="models" hostName="Outside selection" onSync={()=>{}} syncing={false} syncStatus="" syncError="" translationLanguage="en" onTranslationLanguageChange={()=>{}} translationProfile="" onTranslationProfileChange={()=>{}} thinkingDisplay="expanded" onThinkingDisplayChange={()=>{}} onManageHosts={()=>{}} onBack={()=>{}}/></ClientContext.Provider>);
  try {
    await act(async () => render());
    assert.deepEqual(modelHosts,["local"]);
    assert.deepEqual([...document.querySelectorAll("nav button")].map(b=>b.textContent), ["General","Models","Versions and updates"]);
    const picker = document.querySelector<HTMLSelectElement>('[aria-label="Host to configure"]')!;
    await act(async () => {picker.value="remote";picker.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
    assert.deepEqual(modelHosts,["local","remote"]);
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Add model")!.click());
    assert.equal(picker.disabled,true,"finish or cancel a model draft before switching its destination");
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Cancel")!.click());
    assert.equal(picker.disabled,false);
    await act(async () => render([hosts[0]]));
    assert.equal(picker.value,"local","removing the configured host falls back to the local host");
    await act(async () => render([...hosts,{id:"new",name:"New host",baseUrl:"https://new.test",hasToken:false}]));
    assert.equal(picker.options.length,3,"host management changes are reflected without reopening settings");
    await act(async () => render());
    await act(async () => (document.querySelectorAll("nav button")[2] as HTMLButtonElement).click());
    const targetPicker = document.querySelector<HTMLSelectElement>('[aria-label="Update target"]')!;
    assert.equal(targetPicker.options.length,3);
    await act(async()=>{targetPicker.value="daemon:remote";targetPicker.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
    assert.equal(document.querySelectorAll(".settings-section")[2].parentElement!.hidden,false);
    assert.equal(document.querySelectorAll(".settings-section")[0].parentElement!.hidden,true);
    const cards = document.querySelectorAll(".settings-section");
    assert.equal(cards.length,3);
    assert.ok([...cards].every(card=>card.querySelectorAll("button").length===1));
    const updateButton = cards[2].querySelector("button")!;
    assert.equal(updateButton.textContent,"Update now");
    await act(async () => updateButton.click());
    assert.equal(updateButton.disabled,true);
    await act(async () => (document.querySelectorAll("nav button")[1] as HTMLButtonElement).click());
    assert.equal(document.querySelectorAll(".settings-section").length, 0);
    workbenchCurrent = false; // Switching the workbench host invalidates its API, not the explicit update destination.
    await act(async () => {await new Promise(resolve=>setTimeout(resolve,2200));});
    await act(async () => (document.querySelectorAll("nav button")[2] as HTMLButtonElement).click());
    assert.ok(applied);
    assert.deepEqual(updates.filter(([,action])=>action==="prepare" || action==="apply"),[["daemon","prepare","remote"],["daemon","apply","remote"]]);
    assert.equal(document.querySelectorAll(".settings-section")[2].querySelector("button")!.textContent,"Check for updates");
  } finally {
    await act(async()=>root.unmount());
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
    dom.window.close();
  }
});

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
  const calls: Array<[string, string, string | undefined, string | undefined]> = [];
  let pending: ((s: UpdateStatus) => void) | undefined;
  let deferStatus = false;
  const api = { updateComponent: async (target: string, action: string, channel?: string, hostId?: string) => {
    calls.push([target, action, channel, hostId]);
    if (deferStatus && target === "daemon") return new Promise<UpdateStatus>(resolve => { pending = resolve; });
    return { ...status, component: target === "client" ? "desktop" : "daemon", channel: channel ?? "development", phase: action === "status" ? "completed" : "idle", checked_at: action === "status" ? new Date(0).toISOString() : status.checked_at };
  }} as unknown as ClientApi;
  const root = createRoot(document.getElementById("root")!);
  const render = (host: string, client = api) => root.render(<ClientContext.Provider value={{api: client, kind: "desktop"}}><UpdateSettings api={client} hosts={[{id:"local",name:"Local",baseUrl:"http://localhost:8766",hasToken:true},{id:host,name:host,baseUrl:"http://remote:8766",hasToken:true}]}/></ClientContext.Provider>);
  try {
    await act(async () => render("remote-a"));
    assert.match(document.body.textContent!, /Daemon · remote-a/);
    assert.match(document.body.textContent!, /Daemon · This computer/);
    assert.equal(document.querySelectorAll("section").length, 3);
    assert.ok([...document.querySelectorAll("section")].every(section => section.querySelectorAll("button").length === 1));
    assert.ok(calls.some(([target, action]) => target === "client" && action === "check"), "a completed update must not disable future checks");
    assert.ok(calls.some(([target, action]) => target === "daemon" && action === "check"));
    const targetPicker = document.querySelector<HTMLSelectElement>('[aria-label="Update target"]')!;
    await act(async()=>{targetPicker.value="daemon:local";targetPicker.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
    const select = document.querySelectorAll("select")[2];
    await act(async () => { select.value = "stable"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.deepEqual(calls.slice(-2), [["daemon", "channel", "stable", "local"], ["daemon", "check", undefined, "local"]]);
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
      calls.push([target, action, undefined, undefined]);
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
    const offlineApi = {updateComponent: async()=>{throw new Error("fetch failed");}} as unknown as ClientApi;
    await act(async()=>render("offline",offlineApi));
    assert.match(document.body.textContent!,/Unable to read update status/);
    assert.doesNotMatch(document.body.textContent!,/Older installations|manual upgrade/);

  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
