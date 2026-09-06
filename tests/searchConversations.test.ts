import assert from "node:assert/strict";
import { test } from "node:test";
import { searchConversations } from "../shared/searchConversations";
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
