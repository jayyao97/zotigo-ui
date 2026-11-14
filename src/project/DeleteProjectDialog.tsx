import { ShieldAlert, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { ProjectDeletePreview } from "../../shared/zotigod";

export function DeleteProjectDialog({
  projectName,
  preview,
  confirmation,
  error,
  isBusy,
  onConfirmationChange,
  onClose,
  onConfirm,
}: {
  projectName: string;
  preview: ProjectDeletePreview;
  confirmation: string;
  error: string | null;
  isBusy: boolean;
  onConfirmationChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <div className="create-project-dialog archive-workspace-dialog delete-workspace-dialog delete-project-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
        <header>
          <div><h2 id="delete-project-title">{t("app.deleteProject2")}</h2><p>{projectName}</p></div>
          <button type="button" className="dialog-close" disabled={isBusy} onClick={onClose} aria-label={t("app.close2")}><X size={15} /></button>
        </header>
        <p className="archive-workspace-copy">{t("app.theProjectAndItsSourceRegistrationsWillBe")}</p>
        <section className="archive-workspace-warning delete-workspace-warning">
          <ShieldAlert size={17} />
          <span>
            <strong>{t("app.thisCannotBeUndone")}</strong>
            <small>{preview.workspace_ids.length === 0 ? t("app.thisProjectHasNoWorkspacesNoWorkspaceFiles") : t("app.workspacesIncludingArchivedOnesAndTheirManagedFiles", { p0: preview.workspace_ids.length })}</small>
            {preview.dirty_worktree_paths.length > 0 && <small>{t("workspace.discardChanges", { count: preview.dirty_worktree_paths.length })}</small>}
          </span>
        </section>
        {preview.workspace_roots.length > 0 && <details><summary>{t("app.workspaceDirectoriesToDelete")}</summary><ul>{preview.workspace_roots.map((path) => <li key={path} style={{ overflowWrap: "anywhere" }}>{path}</li>)}</ul></details>}
        <label className="delete-workspace-confirmation">
          <span>{t("app.type")}{" "}<strong>{projectName}</strong> {t("app.toConfirm")}</span>
          <input value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} disabled={isBusy} />
        </label>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <footer>
          <button autoFocus type="button" className="dialog-cancel" disabled={isBusy} onClick={onClose}>{t("app.cancel")}</button>
          <button type="button" className="dialog-submit destructive" disabled={isBusy || confirmation !== projectName} onClick={onConfirm}>{isBusy ? t("app.deleting") : t("app.deleteProject")}</button>
        </footer>
      </div>
    </div>
  );
}
