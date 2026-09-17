import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSessionSidePanel, type SessionSidePanels } from "../src/useSessionSidePanel";
import { closeSidePanelTab, fileSidePanelTab, openSidePanelTab } from "../shared/sidePanelTabs";

test("panels follow sessions, preserve shared file references, and close when their final tab closes", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  let panel!: ReturnType<typeof useSessionSidePanel>;
  function Harness({ session, initial }: { session: string; initial?: SessionSidePanels }) {
    panel = useSessionSidePanel(session, initial);
    return <aside hidden={!panel.sidePanelOpen}>{panel.sidePanelTabs.tabs.map((tab) => <span key={tab.id}>{tab.id}</span>)}</aside>;
  }
  const render = async (session: string) => { await act(async () => root.render(<Harness session={session} />)); };
  const file = fileSidePanelTab("/workspace/main.go");
  try {
    await render("a");
    await act(async () => {
      panel.setSidePanelTabs((tabs) => openSidePanelTab(tabs, file));
      panel.setSidePanelOpen(true);
      panel.setSidePanelExpanded(true);
      panel.setDirectoryLocation({ path: "/workspace", sessionId: "a" });
    });
    const finishCloseInA = panel.setSidePanelTabs;
    await render("b");
    assert.equal(document.querySelector("aside")!.hidden, true);
    assert.equal(panel.sidePanelTabs.tabs.length, 0);
    assert.equal(panel.directoryLocation, null);
    await act(async () => {
      panel.setSidePanelTabs((tabs) => openSidePanelTab(tabs, file));
      panel.setSidePanelOpen(true);
    });
    assert.equal(panel.fileOpenInOtherSession("/workspace/main.go"), true);
    // A save/close started in A must not close the same path in B after navigation.
    await act(async () => finishCloseInA((tabs) => closeSidePanelTab(tabs, file.id)));
    assert.equal(panel.sidePanelOpen, true);
    assert.equal(panel.sidePanelTabs.tabs.length, 1);
    assert.equal(panel.fileOpenInOtherSession("/workspace/main.go"), false);
    await render("a");
    assert.equal(panel.sidePanelOpen, false);
    assert.equal(panel.sidePanelExpanded, false);
    assert.deepEqual(panel.directoryLocation, { path: "/workspace", sessionId: "a" });
    await render("b");
    assert.equal(panel.sidePanelTabs.activeTabId, file.id);
    assert.equal(document.querySelector("aside")!.hidden, false);
    await act(async () => panel.setSidePanelTabs((tabs) => closeSidePanelTab(tabs, file.id)));
    assert.equal(document.querySelector("aside")!.hidden, true);
    // Explicitly opening an empty panel still provides the file browser launcher.
    await act(async () => panel.setSidePanelOpen(true));
    assert.equal(document.querySelector("aside")!.hidden, false);
    await act(async () => {
      panel.setSidePanelTabs((tabs) => openSidePanelTab(tabs, { id: "files", kind: "files" }));
      panel.setSidePanelTabs((tabs) => openSidePanelTab(tabs, file));
    });
    await act(async () => panel.setSidePanelTabs((tabs) => closeSidePanelTab(tabs, file.id)));
    assert.equal(panel.sidePanelOpen, false, "the file browser placeholder must not keep an empty editor panel open");
    await render("new");
    assert.equal(panel.sidePanelOpen, false);
    const hostA = panel.panels;
    await act(async () => root.render(<Harness key="host-b" session="a" />));
    assert.deepEqual(panel.panels, {}, "another host must not inherit session panels");
    await act(async () => root.render(<Harness key="host-a" session="a" initial={hostA} />));
    assert.deepEqual(panel.directoryLocation, { path: "/workspace", sessionId: "a" });
    assert.equal(panel.sidePanelOpen, false);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
