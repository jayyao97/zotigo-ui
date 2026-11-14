import { FolderPlus, Search } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { ClientApi, DesktopProjectFolder, DesktopProjectRepository } from "../../shared/clientTypes";
import type { FolderSourceMode } from "../../shared/zotigod";
import { workspaceSourceMatches } from "../../shared/workspaceSourceSelection";
import { RepositoryBaseField } from "../ManagedRepositoryPicker";

export function WorkspaceAddSourceSection({
  client,
  isBusy,
  loading,
  availableRepositories,
  availableFolders,
  matchingRepositories,
  matchingFolders,
  selectedSource,
  selectedRepository,
  selectedFolder,
  query,
  sourceId,
  baseRef,
  mode,
  onQueryChange,
  onSelectSource,
  onBaseRefChange,
  onModeChange,
  onAddOtherRepository,
}: {
  client: ClientApi;
  isBusy: boolean;
  loading: boolean;
  availableRepositories: DesktopProjectRepository[];
  availableFolders: DesktopProjectFolder[];
  matchingRepositories: DesktopProjectRepository[];
  matchingFolders: DesktopProjectFolder[];
  selectedSource: DesktopProjectRepository | DesktopProjectFolder | undefined;
  selectedRepository: DesktopProjectRepository | undefined;
  selectedFolder: DesktopProjectFolder | undefined;
  query: string;
  sourceId: string;
  baseRef: string;
  mode: FolderSourceMode;
  onQueryChange: (query: string) => void;
  onSelectSource: (sourceId: string) => void;
  onBaseRefChange: (baseRef: string) => void;
  onModeChange: (mode: FolderSourceMode) => void;
  onAddOtherRepository: () => void;
}) {
  const selectedOutsideSearch = selectedSource && !workspaceSourceMatches(selectedSource, query);
  return (
            <section className="workspace-add-source">
              <span>{t("workspace.addRepository")}</span>
              {!loading && (availableRepositories.length > 0 || availableFolders.length > 0) ? <>
                <label className="repository-search"><Search size={14} aria-hidden="true" /><input type="search" value={query} disabled={isBusy} aria-label={t("workspace.searchSources")} placeholder={t("workspace.searchSources")} onInput={event => onQueryChange(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></label>
                {matchingRepositories.length === 0 && matchingFolders.length === 0 && <p className="workspace-dialog-note">{t("workspace.noMatchingSources")}</p>}
                <label className="workspace-dialog-field">
                  <span>{t("app.projectSource")}</span>
                  <select disabled={isBusy} value={sourceId} onChange={(event) => onSelectSource(event.target.value)}>
                    <option value="">{t("app.chooseASource")}</option>
                    {selectedOutsideSearch && <option value={selectedSource.id}>{t("workspace.selectedOutsideSearch", { name: selectedSource.name })}</option>}
                    {matchingRepositories.map((source) => <option value={source.id} key={source.id}>{source.name} {t("app.git")}</option>)}
                    {matchingFolders.map((source) => <option value={source.id} key={source.id}>{source.name} {t("app.folder")}</option>)}
                  </select>
                </label>
                {selectedRepository && <div className="workspace-dialog-grid single-column">
                  <RepositoryBaseField client={client} repository={selectedRepository} value={baseRef} disabled={isBusy} onChange={onBaseRefChange} />
                </div>}
                {selectedFolder && <label className="workspace-dialog-field"><span>{t("app.folderMode")}</span><select value={mode} onChange={(event) => onModeChange(event.target.value as FolderSourceMode)}><option value="direct">{t("app.direct")}</option><option value="copy">{t("app.copy")}</option><option value="reference">{t("app.reference")}</option></select></label>}
              </> : !loading && <p className="workspace-dialog-note">{t("app.everySourceInThisProjectIsAlreadyBound")}</p>}
              <button type="button" className="workspace-add-project-source" onClick={onAddOtherRepository} disabled={isBusy || loading}><FolderPlus size={14} /> {t("workspace.otherRepository")}</button>
            </section>
  );
}
