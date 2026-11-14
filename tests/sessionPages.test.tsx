import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSessionPages } from "../src/useSessionPages";
import { mergeSessionPage } from "../shared/sessionPages";
import type { ClientApi, DesktopState, SessionQuery } from "../shared/clientTypes";

test("loaded pages survive polling beyond 200 rows and viewport changes", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const values = {window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true};
  const old = Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  let poll: () => void = () => {};
  dom.window.setInterval = ((fn: () => void) => {poll=fn;return 1;}) as typeof dom.window.setInterval;
  dom.window.clearInterval = () => {};
  const calls: SessionQuery[] = [];
  let fail = false;
  let online: boolean | undefined;
  const api = {querySessions: async (query: SessionQuery) => {
    calls.push(query);
    if (fail) throw new Error("daemon offline");
    const from = Number(query.cursor ?? 0), end = Math.min(from+(query.limit ?? 20),250);
    return {bindings:[],sessions:[],conversations:query.workspaceId === "w" ? Array.from({length:end-from},(_,i)=>({id:String(from+i),title:String(from+i),project_id:null,workspace_id:"w",created_at:"2026-11-13",updated_at:"2026-11-13"})) : [], nextCursor: query.workspaceId === "w" && end<250 ? String(end) : undefined};
  }} satisfies Pick<ClientApi, "querySessions">;
  let view!: ReturnType<typeof useSessionPages>;
  function Harness({ids}: {ids:string[]}) { view=useSessionPages({client:api,enabled:true,active:true,activity:false,channel:"pinned",workspaces:ids,onPage:()=>{},onConnection:value=>{online=value;}}); return null; }
  const root=createRoot(document.querySelector("#root")!);
  try {
    await act(async()=>root.render(<Harness ids={["w"]}/>));
    for(let i=0;i<11;i++) await act(async()=>view.loadMore("w"));
    assert.equal(view.ids("w")?.length,240);
    await act(async()=>poll());
    assert.equal(view.ids("w")?.length,240,"poll must not rewind to 200");
    await act(async()=>root.render(<Harness ids={["w","new-visible"]}/>));
    assert.equal(view.ids("w")?.length,240,"viewport changes must retain expanded pages");
    assert.ok(calls.every(call=>(call.limit ?? 0)<=200));
    assert.equal(online,true);
    fail=true;
    await act(async()=>view.refresh());
    assert.equal(online,false);
    fail=false;
    await act(async()=>view.refresh());
    assert.equal(online,true);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for (const key of Object.keys(values)) { const descriptor=old[key]; if(descriptor) Object.defineProperty(globalThis,key,descriptor); else Reflect.deleteProperty(globalThis,key); }
  }
});

test("page updates preserve user-defined workspace ordering",()=>{
  const conversation=(id:string,position:number)=>({id,title:id,project_id:null,workspace_id:"w",workspace_position:position,created_at:"2026-11-13",updated_at:"2026-11-13"});
  const state:DesktopState={projects:[],repositories:[],folders:[],workspaces:[],conversations:[conversation("a",1),conversation("b",2)],bindings:[],selectedProjectId:null,selectedWorkspaceId:null,selectedConversationId:null};
  const next=mergeSessionPage(state,{conversations:[conversation("b",0)],bindings:[],sessions:[]});
  assert.deepEqual(next.conversations.map(row=>row.id),["b","a"]);
});
