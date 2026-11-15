import { Folder, GitBranch, Plus, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { ClientApi } from "../../shared/clientTypes";
import type { FolderSourceMode } from "../../shared/zotigod";
import { ManagedRepositoryPicker } from "../ManagedRepositoryPicker";
import { folderModeLabel } from "../app/appHelpers";
import type { ProjectSourceDraft } from "../app/appTypes";

export function AddSourcesDialog({
  client,
  forWorkspace,
  subtitle,
  linkedIds,
  selectedRepositoryIds,
  sources,
  message,
  isBusy,
  repositoryAdding,
  onClose,
  onRepositoryIdsChange,
  onRepositoryBusyChange,
  onFolderModeChange,
  onAddFolder,
  onConfirm,
}: {
  client: ClientApi;
  forWorkspace: boolean;
  subtitle: string | undefined;
  linkedIds: string[];
  selectedRepositoryIds: string[];
  sources: ProjectSourceDraft[];
  message: string | null;
  isBusy: boolean;
  repositoryAdding: boolean;
  onClose: () => void;
  onRepositoryIdsChange: (ids: string[]) => void;
  onRepositoryBusyChange: (busy: boolean) => void;
  onFolderModeChange: (selectedPath: string, folderMode: FolderSourceMode) => void;
  onAddFolder: () => void;
  onConfirm: () => void;
}) {
  return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy && !repositoryAdding) onClose(); }} onKeyDown={event => { if (event.key === "Escape" && !isBusy && !repositoryAdding) onClose(); }}>
          <div className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="add-sources-title">
            <header><div><h2 id="add-sources-title">{t(forWorkspace ? "workspace.addRepository" : "app.addSources")}</h2><p>{subtitle}</p></div><button autoFocus type="button" className="dialog-close" disabled={isBusy || repositoryAdding} onClick={onClose} aria-label={t("app.close2")}><X size={15} /></button></header>
            <ManagedRepositoryPicker client={client} selectedIds={selectedRepositoryIds} hideLinked linkedIds={linkedIds} onChange={onRepositoryIdsChange} disabled={isBusy} onBusyChange={onRepositoryBusyChange} />
            <div className="project-source-list">{sources.map((draft) => <div className="project-source-row source-choice-row" key={draft.candidate.selectedPath}>
              {draft.candidate.kind === "git" ? <GitBranch size={15} /> : <Folder size={15} />}
              <span><strong>{draft.candidate.name}</strong><small>{draft.candidate.canonicalPath}</small></span>
              {draft.candidate.kind === "git"
                ? <div className="source-mode-actions"><em>{t("app.gitRepository")}</em></div>
                : <div className="source-mode-actions"><em>{folderModeLabel(draft.folderMode)}</em>{draft.folderMode === "direct" ? <><button type="button" onClick={() => onFolderModeChange(draft.candidate.selectedPath, "copy")}>{t("app.useACopy")}</button><button type="button" onClick={() => onFolderModeChange(draft.candidate.selectedPath, "reference")}>{t("app.useAsReference")}</button></> : <button type="button" onClick={() => onFolderModeChange(draft.candidate.selectedPath, "direct")}>{t("app.useDirectly")}</button>}</div>}
              {draft.candidate.kind === "folder" && draft.folderMode === "direct" && <small className="source-direct-warning">{t("app.workspaceChangesWillAppearInTheOriginalFolder")}</small>}
            </div>)}</div>
            {!forWorkspace && <button type="button" className="project-folder-picker compact" disabled={isBusy || repositoryAdding} onClick={onAddFolder}><Plus size={14} />{t("app.addFolder")}</button>}
            {message && <p className="dialog-error">{message}</p>}
            <footer><button type="button" className="dialog-cancel" disabled={isBusy || repositoryAdding} onClick={onClose}>{t("app.cancel")}</button><button type="button" className="dialog-submit" disabled={isBusy || repositoryAdding || (!sources.length && !selectedRepositoryIds.length)} onClick={onConfirm}>{t(forWorkspace ? "workspace.addRepository" : "app.addSources")}</button></footer>
          </div>
        </div>
  );
}
