import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { SessionContextMenu } from "../src/sidebar/SessionContextMenu";
import { WorkspaceActionMenu } from "../src/sidebar/WorkspaceActionMenu";

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

function clickItem(label: string) {
  const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent === label);
  assert.ok(item, `menu item ${label}`);
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

test("session and workspace menus offer to copy their IDs", async () => {
  const restore = installDom();
  try {
    const copied: string[] = [];
    const noop = () => {};
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<>
      <SessionContextMenu x={0} y={0} unread={false} pinned={false} isBusy={false} onToggleRead={noop} onTogglePinned={noop} onFork={noop} onCopyId={() => copied.push("session")} onRename={noop} onArchive={noop} />
      <WorkspaceActionMenu menuRef={null} opensUp={false} pinned={false} ready kind="web" onTogglePinned={noop} onAddRepository={noop} onBrowseFiles={noop} onCopyPath={noop} onCopyId={() => copied.push("workspace")} onRename={noop} onArchive={noop} onDelete={noop} />
    </>));
    await act(async () => clickItem("Copy Session ID"));
    await act(async () => clickItem("Copy Workspace ID"));
    assert.deepEqual(copied, ["session", "workspace"]);
    await act(async () => root.unmount());
  } finally { restore(); }
});
