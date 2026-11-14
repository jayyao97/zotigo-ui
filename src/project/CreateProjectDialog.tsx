import type { FormEvent } from "react";
import { Folder, GitBranch, Plus, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { ClientApi } from "../../shared/clientTypes";
import type { FolderSourceMode } from "../../shared/zotigod";
import { ManagedRepositoryPicker } from "../ManagedRepositoryPicker";
import { folderModeLabel } from "../app/appHelpers";
import type { ProjectSourceDraft } from "../app/appTypes";

export function CreateProjectDialog({
  client,
  name,
  selectedRepositoryIds,
  sources,
  message,
  isBusy,
  repositoryAdding,
  onClose,
  onSubmit,
  onNameChange,
  onRepositoryIdsChange,
  onRepositoryBusyChange,
  onFolderModeChange,
  onRemoveSource,
  onAddFolder,
}: {
  client: ClientApi;
  name: string;
  selectedRepositoryIds: string[];
  sources: ProjectSourceDraft[];
  message: string | null;
  isBusy: boolean;
  repositoryAdding: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (name: string) => void;
  onRepositoryIdsChange: (ids: string[]) => void;
  onRepositoryBusyChange: (busy: boolean) => void;
  onFolderModeChange: (selectedPath: string, folderMode: FolderSourceMode) => void;
  onRemoveSource: (selectedPath: string) => void;
  onAddFolder: () => void;
}) {
  return (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
        >
          <form className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title" onSubmit={onSubmit}>
            <header>
              <h2 id="create-project-title">{t("app.createProject")}</h2>
              <button type="button" className="dialog-close" onClick={onClose} disabled={isBusy || repositoryAdding} aria-label={t("app.close2")}>
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>

            <label className="project-name-field">
              <span className="sr-only">{t("app.projectName")}</span>
              <Folder size={15} strokeWidth={1.8} />
              <input
                autoFocus
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={t("app.projectName")}
                disabled={isBusy}
              />
            </label>

            <ManagedRepositoryPicker client={client} selectedIds={selectedRepositoryIds} onChange={onRepositoryIdsChange} disabled={isBusy} onBusyChange={onRepositoryBusyChange} />
            <div className="project-folder-field">
              <span>{t("repositories.localSources")}{" "}<small>{t("app.optional")}</small></span>
              {sources.length > 0 && (
                <div className="project-source-list">
                  {sources.map((draft) => (
                    <div className="project-source-row source-choice-row" key={draft.candidate.selectedPath}>
                      {draft.candidate.kind === "git" ? <GitBranch size={15} /> : <Folder size={15} />}
                      <span><strong>{draft.candidate.name}</strong><small>{draft.candidate.canonicalPath}</small></span>
                      {draft.candidate.kind === "git"
                        ? <div className="source-mode-actions"><em>{t("app.gitRepository")}</em></div>
                        : <div className="source-mode-actions"><em>{folderModeLabel(draft.folderMode)}</em>{draft.folderMode === "direct" ? <><button type="button" onClick={() => onFolderModeChange(draft.candidate.selectedPath, "copy")}>{t("app.useACopy")}</button><button type="button" onClick={() => onFolderModeChange(draft.candidate.selectedPath, "reference")}>{t("app.useAsReference")}</button></> : <button type="button" onClick={() => onFolderModeChange(draft.candidate.selectedPath, "direct")}>{t("app.useDirectly")}</button>}</div>}
                      <button type="button" onClick={() => onRemoveSource(draft.candidate.selectedPath)} aria-label={t("app.remove", { p0: draft.candidate.name })}><X size={14} /></button>
                      {draft.candidate.kind === "folder" && draft.folderMode === "direct" && <small className="source-direct-warning">{t("app.workspaceChangesWillAppearInTheOriginalFolder")}</small>}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="project-folder-picker compact" onClick={onAddFolder} disabled={isBusy || repositoryAdding}>
                <Plus size={16} strokeWidth={1.8} />
                <span>{t("app.addFolder")}</span>
              </button>
              <small className="project-dialog-help">{t("repositories.localHelp")}</small>
            </div>

            {message && <p className="dialog-error">{message}</p>}

            <footer>
              <button type="button" className="dialog-cancel" onClick={onClose} disabled={isBusy || repositoryAdding}>{t("app.cancel")}</button>
              <button type="submit" className="dialog-submit" disabled={isBusy || repositoryAdding || !name.trim()}>{t("app.createProject")}</button>
            </footer>
          </form>
        </div>
  );
}
