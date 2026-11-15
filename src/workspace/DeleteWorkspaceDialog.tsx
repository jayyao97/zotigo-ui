import { Check, Copy, FolderOpen, ShieldAlert, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { WorkspaceArchivePreview } from "../../shared/zotigod";

export function DeleteWorkspaceDialog({
  workspaceTitle,
  preview,
  confirmation,
  copiedWorkspacePath,
  error,
  isBusy,
  onConfirmationChange,
  onClose,
  onCopyPath,
  onBrowseFiles,
  onConfirm,
}: {
  workspaceTitle: string;
  preview: WorkspaceArchivePreview;
  confirmation: string;
  copiedWorkspacePath: string | null;
  error: string | null;
  isBusy: boolean;
  onConfirmationChange: (value: string) => void;
  onClose: () => void;
  onCopyPath: () => void;
  onBrowseFiles: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="create-project-dialog archive-workspace-dialog delete-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-workspace-title">
        <header>
          <div>
            <h2 id="delete-workspace-title">{t("app.deleteWorkspace")}</h2>
            <p>{workspaceTitle}</p>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} disabled={isBusy} aria-label={t("app.close2")}><X size={15} /></button>
        </header>
        <p className="archive-workspace-copy">{t("app.workspaceFilesCopiedFoldersAndLinkedWorktreesWill")}</p>
        <div className="archive-workspace-path-row">
          <code className="archive-workspace-path">{preview.root_path}</code>
          <button type="button" className="copy-path-button" title={t("app.copyPath")} aria-label={t("app.copyWorkspacePath")} onClick={onCopyPath}>
            {copiedWorkspacePath === preview.root_path ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
          </button>
          {<button type="button" onClick={onBrowseFiles}><FolderOpen size={14} strokeWidth={1.8} /><span>{t("app.browseFiles")}</span></button>}
        </div>
        <section className="archive-workspace-warning delete-workspace-warning">
          <ShieldAlert size={16} />
          <span>
            <strong>{t("app.thisCannotBeUndone")}</strong>
            <small>{t("app.allManagedWorkspaceFilesWillBeRemovedSessions")}</small>
            {preview.dirty_worktree_paths.length > 0 && <small>{t("workspace.discardChanges", { count: preview.dirty_worktree_paths.length })}</small>}
          </span>
        </section>
        <label className="delete-workspace-confirmation">
          <span>{t("app.type")}{" "}<strong>{workspaceTitle}</strong> {t("app.toConfirm")}</span>
          <input autoFocus value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} disabled={isBusy} />
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={onClose} disabled={isBusy}>{t("app.cancel")}</button>
          <button type="button" className="dialog-submit destructive" onClick={onConfirm} disabled={isBusy || confirmation !== workspaceTitle}>{isBusy ? t("app.deleting") : t("app.deleteWorkspace2")}</button>
        </footer>
      </div>
    </div>
  );
}
