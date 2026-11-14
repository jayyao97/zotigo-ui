import { Folder, GitBranch, Search, ShieldAlert } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { ClientApi, DesktopProject, DesktopProjectFolder } from "../../shared/clientTypes";
import type { FolderSourceMode } from "../../shared/zotigod";
import { RepositoryBaseField } from "../ManagedRepositoryPicker";
import type { WorkspaceRepositoryDraft } from "../app/appTypes";

export function CreateWorkspaceSourcesField({
  client,
  project,
  folders,
  sourceQuery,
  canSelectAll,
  canDeselectAll,
  workspaceRepositories,
  visibleRepositories,
  visibleFolders,
  folderModes,
  selectedSourceCount,
  isBusy,
  onSelectAll,
  onSourceQueryChange,
  onRepositorySelectedChange,
  onRepositoryBaseRefChange,
  onFolderModeChange,
}: {
  client: ClientApi;
  project: DesktopProject;
  folders: DesktopProjectFolder[];
  sourceQuery: string;
  canSelectAll: boolean;
  canDeselectAll: boolean;
  workspaceRepositories: WorkspaceRepositoryDraft[];
  visibleRepositories: WorkspaceRepositoryDraft[];
  visibleFolders: DesktopProjectFolder[];
  folderModes: Record<string, "" | FolderSourceMode>;
  selectedSourceCount: number;
  isBusy: boolean;
  onSelectAll: (selected: boolean) => void;
  onSourceQueryChange: (query: string) => void;
  onRepositorySelectedChange: (repositoryId: string, selected: boolean) => void;
  onRepositoryBaseRefChange: (repositoryId: string, baseRef: string) => void;
  onFolderModeChange: (folderId: string, mode: "" | FolderSourceMode) => void;
}) {
  return (
            <div className="workspace-sources-field">
              <div className="workspace-sources-heading">
                <span>{t(folders.some(folder => folder.project_id === project.id) ? "app.sources" : "repositories.title")}</span>
                <div>
                  <button type="button" disabled={isBusy || !canSelectAll} onClick={() => onSelectAll(true)}>{t(sourceQuery.trim() ? "workspace.selectMatches" : "app.selectAll")}</button>
                  <button type="button" disabled={isBusy || !canDeselectAll} onClick={() => onSelectAll(false)}>{t(sourceQuery.trim() ? "workspace.deselectMatches" : "app.deselectAll")}</button>
                </div>
              </div>
              {(workspaceRepositories.length > 0 || folders.some((folder) => folder.project_id === project.id)) && (
                <small className="workspace-sources-help">{t("app.availableSourcesAreSelectedByDefaultUncheckAnything")}</small>
              )}
              <label className="repository-search"><Search size={14} aria-hidden="true" /><input type="search" value={sourceQuery} disabled={isBusy} aria-label={t("workspace.searchSources")} placeholder={t("workspace.searchSources")} onInput={event => onSourceQueryChange(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
              <small className="workspace-sources-help">{t("workspace.selectedSourceCount", { count: selectedSourceCount })}</small>
              {sourceQuery.trim() && visibleRepositories.length === 0 && visibleFolders.length === 0 && <p className="workspace-dialog-note">{t("workspace.noMatchingSources")}</p>}
              <div className="workspace-source-list">
              {visibleRepositories.map((draft) => (
                <div className={`workspace-source-card ${draft.selected ? "selected" : ""}`} key={draft.repository.id}>
                  <label className="workspace-source-toggle">
                    <input type="checkbox" checked={draft.selected} disabled={draft.repository.availability !== "available"} onChange={(event) => {
                      const selected = event.target.checked;
                      onRepositorySelectedChange(draft.repository.id, selected);
                    }} />
                    <GitBranch size={15} />
                    <strong>{draft.repository.name}</strong>
                  </label>
                  {draft.repository.availability !== "available" && <p className="workspace-dialog-note">{t("app.unavailableReconnectOrRepairThisSourceBeforeUsing")}</p>}
                  {draft.selected && (
                    <div className="workspace-source-settings">
                      <RepositoryBaseField client={client} repository={draft.repository} value={draft.baseRef} disabled={isBusy} onChange={value => onRepositoryBaseRefChange(draft.repository.id, value)} />
                    </div>
                  )}
                </div>
              ))}
              {visibleFolders.map((folder) => (
                <div className={`workspace-source-card ${folderModes[folder.id] ? "selected" : ""}`} key={folder.id}>
                  <label className="workspace-source-toggle"><input type="checkbox" checked={Boolean(folderModes[folder.id])} disabled={folder.availability !== "available"} onChange={(event) => onFolderModeChange(folder.id, event.target.checked ? folder.default_mode : "")} /><Folder size={15} /><strong>{folder.name}</strong></label>
                  {folder.availability !== "available" && <p className="workspace-dialog-note">{t("app.unavailableReconnectOrRepairThisSourceBeforeUsing")}</p>}
                  {folderModes[folder.id] === "direct" && <p className="workspace-direct-warning"><ShieldAlert size={14} /> {t("app.directChangesAppearImmediatelyInTheOriginalFolder")}</p>}
                  {folderModes[folder.id] === "copy" && <p className="workspace-dialog-note">{t("app.independentCopyChangesStayInsideThisWorkspace")}</p>}
                  {folderModes[folder.id] === "reference" && <p className="workspace-dialog-note">{t("app.referenceSnapshotAReadOnlyCopyIsPlaced")}</p>}
                </div>
              ))}
              {workspaceRepositories.length === 0 && folders.every((folder) => folder.project_id !== project.id) && (
                <p className="workspace-dialog-note">{t("app.thisWillBeAnEmptyWorkspaceWithCode")}</p>
              )}
              </div>
            </div>
  );
}
