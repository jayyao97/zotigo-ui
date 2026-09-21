import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceSessionList } from "../src/WorkspaceSessionList";
import { SidebarCollapse } from "../src/SidebarCollapse";
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

test("sidebar collapse retains the list during motion, resets after closing, and tolerates reversal", async () => {
  const restore = installDom();
  const root = createRoot(document.getElementById("root")!);
  const render = async (open: boolean) => {
    await act(async () => root.render(<SidebarCollapse open={open}>
      <WorkspaceSessionList>{Array.from({ length: 12 }, (_, i) => <span className="session" key={i}>{i}</span>)}</WorkspaceSessionList>
    </SidebarCollapse>));
  };
  const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 290)); });
  try {
    await render(true);
    await act(async () => document.querySelector<HTMLButtonElement>(".workspace-sessions-more")!.click());
    await render(false);
    assert.equal(document.querySelectorAll(".session").length, 10);
    assert.ok(document.querySelector(".sidebar-collapse[inert][aria-hidden=true]"));
    await render(true);
    await settle();
    assert.equal(document.querySelectorAll(".session").length, 10);
    assert.ok(document.querySelector(".sidebar-collapse.is-open.is-settled:not([inert])"));
    await render(false);
    await settle();
    assert.equal(document.querySelectorAll(".session").length, 0);
    await render(true);
    assert.equal(document.querySelectorAll(".session").length, 5);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
    await render(false);
    assert.equal(document.querySelectorAll(".session").length, 0);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
