import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceSessionList } from "../src/WorkspaceSessionList";
function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><main id=outside></main><div id=root></div></body></html>", {
    pretendToBeVisual: true,
  });
  const replacements = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    navigator: dom.window.navigator,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.fromEntries(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  }
  return () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  };
}


test("workspace sessions reveal five at a time and collapse resets the limit",async()=>{
 const restore=installDom();const root=createRoot(document.getElementById("root")!);
 const render=async(open:boolean,count=12)=>{await act(async()=>root.render(open?<WorkspaceSessionList>{Array.from({length:count},(_,i)=><span className="session" key={i}>{i}</span>)}</WorkspaceSessionList>:null));};
 const more=()=>document.querySelector<HTMLButtonElement>(".workspace-sessions-more");
 try {
  await render(true);assert.equal(document.querySelectorAll(".session").length,5);
  await act(async()=>more()!.click());assert.equal(document.querySelectorAll(".session").length,10);
  await act(async()=>more()!.click());assert.equal(document.querySelectorAll(".session").length,12);assert.equal(more(),null);
  await render(false);await render(true);assert.equal(document.querySelectorAll(".session").length,5);assert.ok(more());
  await render(false);await render(true,5);assert.equal(more(),null);
 } finally {await act(async()=>root.unmount());restore();}
});
