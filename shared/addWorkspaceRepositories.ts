import type { ClientApi, DesktopState, DesktopWorkspace } from "./clientTypes";
import { workspaceHasRepository } from "./workspaceSourceSelection";
import { t } from "./i18n";

/** Resume partial additions by reusing project links and workspace bindings. */
export async function addWorkspaceRepositories(
  client: Pick<ClientApi, "getDesktopState" | "getWorkspaceSources" | "addProjectSources" | "addWorkspaceSource">,
  workspace: Pick<DesktopWorkspace, "id" | "project_id">,
  repositoryIds: string[],
  onState: (state: DesktopState) => void,
): Promise<void> {
  let state = await client.getDesktopState();
  let bindings = await client.getWorkspaceSources(workspace.id);
  for (const repositoryId of new Set(repositoryIds)) {
    const findSource = () => state.repositories.find(source => source.project_id === workspace.project_id && source.repository_id === repositoryId);
    let source = findSource();
    if (!source) {
      state = await client.addProjectSources(workspace.project_id, [{ repositoryId }]);
      onState(state);
      source = findSource();
    }
    if (!source) throw new Error("Added repository was not returned in the project");
    const bound = bindings.find(binding => workspaceHasRepository([binding], source!));
    if (bound && bound.status !== "ready") {
      throw new Error(bound.error || t("workspace.unready", { state: bound.status }));
    }
    if (!bound) {
      bindings = await client.addWorkspaceSource(workspace.id, { sourceId: source.id });
    }
  }
  onState(state);
}
