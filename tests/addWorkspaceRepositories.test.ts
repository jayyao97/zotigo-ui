import assert from "node:assert/strict";
import { test } from "node:test";
import { addWorkspaceRepositories } from "../shared/addWorkspaceRepositories";
import type { DesktopState, DesktopProjectRepository } from "../shared/clientTypes";
import type { CatalogWorkspaceSource } from "../shared/zotigod";

test("workspace additions reuse project repositories and resume after a partial failure", async () => {
  const source = (id: string) => ({ id: `source-${id}`, project_id: "project", repository_id: id }) as DesktopProjectRepository;
  const state = { repositories: [source("existing")] } as DesktopState;
  let bindings: CatalogWorkspaceSource[] = [];
  const linked: string[] = [];
  let fail = true;
  const client = {
    getDesktopState: async () => state,
    getWorkspaceSources: async () => bindings,
    addProjectSources: async (_project: string, inputs: { repositoryId?: string }[]) => {
      for (const input of inputs) { linked.push(input.repositoryId!); state.repositories.push(source(input.repositoryId!)); }
      return state;
    },
    addWorkspaceSource: async (_workspace: string, input: { sourceId: string }) => {
      if (input.sourceId === "source-new" && fail) throw new Error("temporary failure");
      bindings = [...bindings, { source: { id: input.sourceId }, status: "ready" } as CatalogWorkspaceSource];
      return bindings;
    },
  };
  const workspace = { id: "workspace", project_id: "project" };
  await assert.rejects(addWorkspaceRepositories(client, workspace, ["existing", "new"], () => {}), /temporary failure/);
  assert.deepEqual(linked, ["new"]);
  assert.equal(bindings.length, 1);
  fail = false;
  await addWorkspaceRepositories(client, workspace, ["existing", "new", "new"], () => {});
  assert.deepEqual(linked, ["new"]);
  assert.equal(bindings.length, 2);
  bindings[0] = { ...bindings[0], status: "error", error: "checkout failed" };
  await assert.rejects(addWorkspaceRepositories(client, workspace, ["existing"], () => {}), /checkout failed/);
});
