import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCreateProjectInput } from "../backend/projectInputValidation";
import { orderSidebarItems, reorderSidebarIds } from "../shared/sidebarOrdering";
import type { DesktopProjectFolder, DesktopProjectRepository } from "../shared/clientTypes";
import { initialWorkspaceSourceSelection } from "../shared/workspaceSourceSelection";

test("create Project input accepts an empty Source list", () => {
  assert.deepEqual(parseCreateProjectInput({ name: "Empty Project" }), { name: "Empty Project", sources: [] });
});

test("Workspace Source defaults select every available Source", () => {
  const repository = (id: string, availability: "available" | "unavailable" = "available") => ({
    id, project_id: "project", repo_key: id, name: id, source_path: `/tmp/${id}`,
    git_common_dir: `/tmp/${id}/.git`, default_base_ref: "HEAD",
    availability, created_at: "now", updated_at: "now",
  }) as DesktopProjectRepository;
  const folder = (id: string, availability: "available" | "unavailable" = "available") => ({
    id, project_id: "project", source_key: id, name: id, source_path: `/tmp/${id}`,
    default_mode: "reference" as const, availability, created_at: "now", updated_at: "now",
  }) as DesktopProjectFolder;

  assert.deepEqual(
    initialWorkspaceSourceSelection([repository("repo"), repository("missing", "unavailable")], [folder("notes")]),
    { repositoryIds: ["repo"], folderModes: { notes: "reference" } },
  );
});

test("sidebar reorder inserts before and after without changing invalid drops", () => {
  assert.deepEqual(reorderSidebarIds(["a", "b", "c"], "a", "b", "after"), ["b", "a", "c"]);
  assert.deepEqual(reorderSidebarIds(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
  assert.deepEqual(reorderSidebarIds(["a", "b"], "a", "a", "before"), ["a", "b"]);
});

test("new sidebar items precede a saved manual order", () => {
  const items = [
    { id: "oldest", created_at: "2026-01-01T00:00:00Z" },
    { id: "saved", created_at: "2026-02-01T00:00:00Z" },
    { id: "newest", created_at: "2026-03-01T00:00:00Z" },
  ];

  assert.deepEqual(
    orderSidebarItems(items, ["saved"]).map((item) => item.id),
    ["newest", "oldest", "saved"],
  );
  assert.deepEqual(
    orderSidebarItems(items, ["oldest", "newest", "saved"]).map((item) => item.id),
    ["oldest", "newest", "saved"],
  );
});
