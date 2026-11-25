import { Folder, FolderPlus, GitBranch } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { ClientApi, DesktopProjectFolder, DesktopProjectRepository } from "../../shared/clientTypes";
import type { FolderSourceMode } from "../../shared/zotigod";
import { RepositoryBaseField } from "../ManagedRepositoryPicker";
import { SearchableSelect } from "../SearchableSelect";

export function WorkspaceAddSourceSection({
  client,
  isBusy,
  loading,
  availableRepositories,
  availableFolders,
  selectedRepository,
  selectedFolder,
  sourceId,
  baseRef,
  mode,
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
  selectedRepository: DesktopProjectRepository | undefined;
  selectedFolder: DesktopProjectFolder | undefined;
  sourceId: string;
  baseRef: string;
  mode: FolderSourceMode;
  onSelectSource: (sourceId: string) => void;
  onBaseRefChange: (baseRef: string) => void;
  onModeChange: (mode: FolderSourceMode) => void;
  onAddOtherRepository: () => void;
}) {
  const options = [
    ...availableRepositories.map(source => ({ value: source.id, label: source.name, detail: source.remote_url || source.source_path, keywords: [source.source_path], icon: <GitBranch size={14} aria-hidden="true" /> })),
    ...availableFolders.map(source => ({ value: source.id, label: source.name, detail: source.source_path, icon: <Folder size={14} aria-hidden="true" /> })),
  ];
  return (
            <section className="workspace-add-source">
              <span>{t("workspace.addRepository")}</span>
              {!loading && options.length > 0 ? <>
                <div className="workspace-dialog-field">
                  <span>{t("app.projectSource")}</span>
                  <SearchableSelect value={sourceId} options={options} disabled={isBusy} onChange={onSelectSource}
                    ariaLabel={t("app.projectSource")} placeholder={t("app.chooseASource")}
                    searchPlaceholder={t("workspace.searchSources")} emptyText={t("workspace.noMatchingSources")} />
                </div>
                {selectedRepository && <div className="workspace-dialog-grid single-column">
                  <RepositoryBaseField client={client} repository={selectedRepository} value={baseRef} disabled={isBusy} onChange={onBaseRefChange} />
                </div>}
                {selectedFolder && <label className="workspace-dialog-field"><span>{t("app.folderMode")}</span><select value={mode} disabled={isBusy} onChange={(event) => onModeChange(event.target.value as FolderSourceMode)}><option value="direct">{t("app.direct")}</option><option value="copy">{t("app.copy")}</option><option value="reference">{t("app.reference")}</option></select></label>}
              </> : !loading && <p className="workspace-dialog-note">{t("app.everySourceInThisProjectIsAlreadyBound")}</p>}
              <button type="button" className="workspace-add-project-source" onClick={onAddOtherRepository} disabled={isBusy || loading}><FolderPlus size={14} /> {t("workspace.otherRepository")}</button>
            </section>
  );
}
