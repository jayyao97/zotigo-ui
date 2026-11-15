import { Check, Copy, FolderOpen, ShieldAlert, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { WorkspaceArchivePreview } from "../../shared/zotigod";

export function ArchiveWorkspaceDialog({
  workspaceTitle,
  preview,
  copiedWorkspacePath,
  error,
  isBusy,
  onClose,
  onCopyPath,
  onBrowseFiles,
  onConfirm,
}: {
  workspaceTitle: string;
  preview: WorkspaceArchivePreview;
  copiedWorkspacePath: string | null;
  error: string | null;
  isBusy: boolean;
  onClose: () => void;
  onCopyPath: () => void;
  onBrowseFiles: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="create-project-dialog archive-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-workspace-title">
        <header>
          <div>
            <h2 id="archive-workspace-title">{t("app.archiveWorkspace")}</h2>
            <p>{workspaceTitle}</p>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} disabled={isBusy} aria-label={t("app.close2")}><X size={15} /></button>
        </header>
        <p className="archive-workspace-copy">{t("app.sessionsGitBranchesArtifactsAndNotesAreKept")}</p>
        <div className="archive-workspace-path-row">
          <code className="archive-workspace-path">{preview.root_path}</code>
          <button type="button" className="copy-path-button" title={t("app.copyPath")} aria-label={t("app.copyWorkspacePath")} onClick={onCopyPath}>
            {copiedWorkspacePath === preview.root_path ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
          </button>
          {<button type="button" onClick={onBrowseFiles}><FolderOpen size={14} strokeWidth={1.8} /><span>{t("app.browseFiles")}</span></button>}
        </div>
        {preview.worktree_paths.length > 0 && (
          <section className="archive-workspace-summary">
            <strong>{t("workspace.removeWorktrees", { count: preview.worktree_paths.length })}</strong>
            {preview.worktree_paths.map((worktreePath) => <small key={worktreePath}>{worktreePath}</small>)}
          </section>
        )}
        {preview.dirty_worktree_paths.length > 0 && (
          <section className="archive-workspace-warning"><ShieldAlert size={16} /><span><strong>{t("app.uncommittedChangesFound")}</strong><small>{t("app.commitOrDiscardChangesInTheseWorktreesBefore")}</small>{preview.dirty_worktree_paths.map((worktreePath) => <code key={worktreePath}>{worktreePath}</code>)}</span></section>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={onClose} disabled={isBusy}>{t("app.cancel")}</button>
          <button type="button" className="dialog-submit destructive" onClick={onConfirm} disabled={isBusy || preview.dirty_worktree_paths.length > 0}>{isBusy ? t("app.archiving") : t("app.archiveWorkspace2")}</button>
        </footer>
      </div>
    </div>
  );
}
