import assert from "node:assert/strict";
import test from "node:test";
import {
  closeSidePanelTab,
  emptySidePanelTabs,
  retainFileTabs,
  fileSidePanelTab,
  openSidePanelTab,
  subagentSidePanelTab,
} from "../shared/sidePanelTabs";

test("side panel tabs preserve tabs of different kinds", () => {
  const withOverview = openSidePanelTab(emptySidePanelTabs, { id: "subagents", kind: "subagents" });
  const withRun = openSidePanelTab(withOverview, subagentSidePanelTab("run-1"));
  const withFile = openSidePanelTab(withRun, fileSidePanelTab("/workspace/main.go", 12));

  assert.deepEqual(withFile.tabs.map((tab) => tab.id), ["subagents", "subagent:run-1", "file:/workspace/main.go"]);
  assert.equal(withFile.activeTabId, "file:/workspace/main.go");
});

test("opening an existing file tab updates its reveal location", () => {
  const opened = openSidePanelTab(emptySidePanelTabs, fileSidePanelTab("/workspace/main.go", 12));
  const reopened = openSidePanelTab(opened, fileSidePanelTab("/workspace/main.go", 30, 4));

  assert.equal(reopened.tabs.length, 1);
  assert.deepEqual(reopened.tabs[0], fileSidePanelTab("/workspace/main.go", 30, 4));
});

test("closing an active side panel tab selects its neighbor", () => {
  const state = {
    tabs: [
      { id: "subagents", kind: "subagents" } as const,
      subagentSidePanelTab("run-1"),
      fileSidePanelTab("/workspace/main.go"),
    ],
    activeTabId: "subagent:run-1",
  };

  const closed = closeSidePanelTab(state, "subagent:run-1");
  assert.equal(closed.activeTabId, "file:/workspace/main.go");
});

test("navigating sessions retains open files and discards session-bound transcripts", () => {
  let state = openSidePanelTab(emptySidePanelTabs, { id: "files", kind: "files" });
  state = openSidePanelTab(state, subagentSidePanelTab("session-a-run"));
  state = openSidePanelTab(state, fileSidePanelTab("/session-a/README.md", 5));
  const retained = retainFileTabs(state);
  assert.deepEqual(retained.tabs.map((tab) => tab.id), ["files", "file:/session-a/README.md"]);
  assert.equal(retained.activeTabId, "file:/session-a/README.md");
  assert.equal(retainFileTabs({ ...state, activeTabId: "subagent:session-a-run" }).activeTabId, null);
  assert.equal(retainFileTabs(emptySidePanelTabs).activeTabId, null);
});
