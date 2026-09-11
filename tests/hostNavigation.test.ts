import assert from "node:assert/strict";
import test from "node:test";

import { loadHostDesktopState } from "../shared/hostNavigation";
import type { DesktopState } from "../shared/clientTypes";

const state: DesktopState = {
  projects: [], repositories: [], folders: [], workspaces: [], conversations: [], bindings: [],
  selectedProjectId: null, selectedWorkspaceId: null, selectedConversationId: null,
};

test("cold startup restores selection while a host switch opens a new session", async () => {
  const calls: string[] = [];
  const client = {
    getDesktopState: async () => { calls.push("restore"); return state; },
    selectProject: async (id: string | null) => { calls.push(`select:${String(id)}`); return state; },
  };

  assert.equal(await loadHostDesktopState(client, false), state);
  assert.deepEqual(calls, ["restore"]);

  calls.length = 0;
  assert.equal(await loadHostDesktopState(client, true), state);
  assert.deepEqual(calls, ["select:null"]);
});
