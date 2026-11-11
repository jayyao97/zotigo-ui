import type { CatalogWorkspaceSource, FolderSourceMode } from "./zotigod";
import type { DesktopProjectFolder, DesktopProjectRepository } from "./clientTypes";

export function workspaceBranchSuggestion(bindings: CatalogWorkspaceSource[]): string {
  const branches = new Set(bindings.filter(binding => binding.source.kind === "git")
    .map(binding => binding.branch_name?.trim()).filter((branch): branch is string => Boolean(branch)));
  return branches.size === 1 ? [...branches][0] : "";
}

export function workspaceHasRepository(bindings: CatalogWorkspaceSource[], source: DesktopProjectRepository): boolean {
  return bindings.some(binding => binding.source.id === source.id
    || Boolean(source.repository_id && (binding.repository_id ?? binding.source.repository_id) === source.repository_id));
}

export function initialWorkspaceSourceSelection(
  repositories: DesktopProjectRepository[],
  folders: DesktopProjectFolder[],
): { repositoryIds: string[]; folderModes: Record<string, "" | FolderSourceMode> } {
  const availableRepositories = repositories.filter((source) => source.availability === "available");
  return {
    repositoryIds: availableRepositories.map((repository) => repository.id),
    folderModes: Object.fromEntries(folders.map((folder) => [folder.id, folder.availability === "available" ? folder.default_mode : ""])),
  };
}

/** Search display names and locations without changing the underlying selection. */
export function workspaceSourceMatches(source: { name: string; source_path: string; remote_url?: string }, query: string): boolean {
  const search = query.trim().toLocaleLowerCase();
  return !search || [source.name, source.source_path, source.remote_url ?? ""].some(value => value.toLocaleLowerCase().includes(search));
}
