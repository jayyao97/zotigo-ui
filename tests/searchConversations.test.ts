import assert from "node:assert/strict";
import { test } from "node:test";
import { searchConversations, searchWorkspaces } from "../shared/searchConversations";
import type { DesktopState } from "../shared/clientTypes";

test("search combines title and project/workspace terms and orders recent sessions", () => {
  const state = { projects: [{ id: "p", name: "Zotigo" }], workspaces: [{ id: "w", title: "Linux dev" }], conversations: [
    { id: "a", project_id: "p", workspace_id: "w", title: "Install daemon", updated_at: "2026-09-01" },
    { id: "b", project_id: null, workspace_id: null, title: "Other session", updated_at: "2026-09-02" },
  ] } as DesktopState;
  assert.deepEqual(searchConversations(state, "").map((item) => item.id), ["b", "a"]);
  assert.deepEqual(searchConversations(state, "  ZOTIGO  linux install ").map((item) => item.id), ["a"]);
  assert.equal(searchConversations(state, "missing").length, 0);
  assert.equal(searchConversations(state, "other")[0].context, "");
});

test("an empty workspace can be found by name and disambiguated by project", () => {
  const state = { projects: [{ id: "p", name: "Chat" }, { id: "q", name: "Tools" }],
    workspaces: [{ id: "a", project_id: "p", title: "Linux staging" }, { id: "b", project_id: "p", title: "Linux" },
      { id: "c", project_id: "q", title: "Linux" }], conversations: [] } as unknown as DesktopState;
  const search = (query: string) => searchWorkspaces(state.projects, state.workspaces, query).map(row => row.workspace.id);
  assert.deepEqual(search(""), []);
  assert.deepEqual(search("LINUX"), ["b", "c", "a"]);
  assert.deepEqual(search("linux tools"), ["c"]);
});
