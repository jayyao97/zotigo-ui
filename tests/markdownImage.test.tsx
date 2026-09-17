import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownImage, MarkdownImageContext } from "../src/MarkdownImage";
import { ClientContext } from "../src/ClientContext";
import type { ClientApi, ImagePreviewResult } from "../shared/clientTypes";
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


test("outside images become file links and stale results cannot cross sessions", async () => {
 const restore=installDom();const root=createRoot(document.getElementById("root")!);
 const requests: Array<{explicit?: boolean;resolve:(value:ImagePreviewResult)=>void}>=[];
 const api={previewImage:(input:{explicitOpen?:boolean})=>new Promise<ImagePreviewResult>(resolve=>requests.push({explicit:input.explicitOpen,resolve}))} as unknown as ClientApi;
 const render=async(sessionId:string)=>{await act(async()=>root.render(<ClientContext.Provider value={{api,kind:"desktop"}}><MarkdownImageContext.Provider value={{sessionId,basePath:"/workspace",baseKind:"directory"}}><MarkdownImage src="/tmp/test.png" alt="test image" /></MarkdownImageContext.Provider></ClientContext.Provider>));};
 const image:ImagePreviewResult={kind:"image",file:{path:"/tmp/test.png",name:"test.png",mediaType:"image/png",dataBase64:"AA==",sizeBytes:1,mtimeMs:1}};
 try {
  await render("a");assert.equal(requests[0].explicit,false);
  await act(async()=>requests[0].resolve({kind:"requires_confirmation"}));
  assert.equal(document.querySelector("img"),null);
  assert.equal(document.querySelector("a")?.getAttribute("href"),"/tmp/test.png");
  assert.equal(document.querySelector("a")?.textContent,"test image");
  assert.equal(requests.length,1);
  await render("b");
  await render("c");
  await act(async()=>requests[1].resolve(image));assert.equal(document.querySelector("img"),null);
  assert.equal(requests[2].explicit,false);
  await act(async()=>requests[2].resolve(image));assert.ok(document.querySelector("img"));
 } finally {await act(async()=>root.unmount());restore();}
});
