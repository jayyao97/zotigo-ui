import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ModelSettings } from "../src/ModelSettings";
import { ClientContext } from "../src/ClientContext";
import type { ClientApi } from "../shared/clientTypes";
import { parseModelSettingsChange, type ModelSettingsChange, type ModelSettings as Settings } from "../shared/modelSettings";

test("model settings retain keys by default, explicitly clear them, test drafts and keep failed drafts", async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"https://zotigo.test"});
  const globals={window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true};
  const previous=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true});
  const settings:Settings={revision:"revision-1",defaults:{context_window:200000,max_output_tokens:120000},default_profile:"gpt-5.6-sol",profiles:[{name:"gpt-5.6-sol",provider:"deepseek",model:"example",base_url:"",thinking_level:"",context_window:0,max_output_tokens:null,mode:"",has_api_key:true}]};
  const changes:ModelSettingsChange[]=[];let tested=0;let fail=false;
  const api={getModelSettings:async()=>settings,updateModelSettings:async(change:ModelSettingsChange)=>{changes.push(change);if(fail)throw new Error("conflict");return settings;},testModelSettings:async()=>{tested++;return {ok:true};}} as unknown as ClientApi;
  const root=createRoot(document.getElementById("root")!);
  const click=async(text:string)=>{const button=[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text);assert.ok(button,`missing ${text}`);await act(async()=>button.click());};
  try {
    await act(async()=>root.render(<ClientContext.Provider value={{api,kind:"web"}}><ModelSettings hostName="test-host"/></ClientContext.Provider>));
    assert.match(document.body.textContent!,/test-host/);
    await click("Edit");
    assert.equal(document.querySelector<HTMLSelectElement>("form select")!.value,"deepseek");
    assert.equal(document.querySelector<HTMLInputElement>("form input")!.value,"gpt-5.6-sol");
    assert.equal(document.querySelector<HTMLInputElement>('input[type=password]')!.value,"");
    assert.match(document.body.textContent!,/200,000/);
    assert.match(document.body.textContent!,/120,000/);
    const limits=[...document.querySelectorAll<HTMLInputElement>('input[type=number]')];
    assert.equal(limits[0].value, "");assert.equal(limits[0].placeholder,"200,000");
    assert.equal(limits[1].value, "");assert.equal(limits[1].placeholder,"120,000");
    await click("Test connection");assert.equal(tested,1);assert.match(document.body.textContent!,/test passed/);assert.equal(changes.length,0);
    await click("Save");assert.equal(changes[0].api_key,undefined);assert.equal(changes[0].revision,"revision-1");
    await click("Edit");await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await click("Save");assert.equal(changes[1].api_key,"");
    await click("Edit");fail=true;await click("Save");assert.ok(document.querySelector("form"));assert.match(document.querySelector('[role=alert]')!.textContent!,/conflict/);
    await click("Cancel");await click("Add model");assert.equal(document.querySelector<HTMLInputElement>("form input")!.disabled,false);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});

test("model changes reject malformed data and forward only known fields",()=>{
  assert.throws(()=>parseModelSettingsChange({action:"save"}));
  const data=parseModelSettingsChange({revision:"r",action:"create",arbitrary:"discard",profile:{name:"new",provider:"openai",model:"example",base_url:"",thinking_level:"",context_window:0,max_output_tokens:null,mode:"",has_api_key:false,api_key:"do-not-forward"}});
  assert.equal(data.api_key,undefined);assert.ok(!JSON.stringify(data).includes("do-not-forward"));assert.ok(!JSON.stringify(data).includes("arbitrary"));
});

test("model settings display and preserve saved thinking levels, including max and unknown values", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://zotigo.test" });
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  const click = async (text: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text);
    assert.ok(button, `missing ${text}`);
    await act(async () => button.click());
  };
  try {
    for (const [provider, level] of [["openai", "max"], ["openai", "disabled"], ["anthropic", "future-level"], ["gemini", "high"], ["deepseek", "disabled"]]) {
      const profile = { name: "saved", provider, model: "example", base_url: "", thinking_level: level, context_window: 0, max_output_tokens: null, mode: "", has_api_key: true };
      const settings: Settings = { revision: "r", default_profile: "saved", profiles: [profile] };
      const changes: ModelSettingsChange[] = [];
      const api = {
        getModelSettings: async () => settings,
        updateModelSettings: async (change: ModelSettingsChange) => { changes.push(change); return settings; },
      } as unknown as ClientApi;
      await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ModelSettings hostName="test-host" /></ClientContext.Provider>));
      await click("Edit");
      const select = document.querySelector<HTMLSelectElement>("details select")!;
      assert.equal(select.value, level);
      assert.equal(select.selectedOptions[0].textContent, level);
      if (provider !== "openai") assert.ok(![...select.options].some(option => option.value === "max"));
      await click("Save");
      assert.equal(changes[0].profile.thinking_level, level);
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
