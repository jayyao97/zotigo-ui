import type { FolderSourceMode } from "./zotigod";
import type { DesktopProjectFolder, DesktopProjectRepository } from "./clientTypes";

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
