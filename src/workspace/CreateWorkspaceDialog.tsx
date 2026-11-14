import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { DesktopProject } from "../../shared/clientTypes";
import type { WorkspaceRepositoryDraft } from "../app/appTypes";

export function CreateWorkspaceDialog({
  project,
  title,
  branch,
  workspaceRepositories,
  message,
  isBusy,
  onClose,
  onSubmit,
  onTitleChange,
  onBranchChange,
  children,
}: {
  project: DesktopProject;
  title: string;
  branch: string;
  workspaceRepositories: WorkspaceRepositoryDraft[];
  message: string | null;
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (title: string) => void;
  onBranchChange: (branch: string) => void;
  children: ReactNode;
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
          <form
            className="create-project-dialog create-workspace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
            onSubmit={onSubmit}
          >
            <header>
              <div>
                <h2 id="create-workspace-title">{t("app.createWorkspace")}</h2>
                <p>{project.name}</p>
              </div>
              <button type="button" className="dialog-close" onClick={onClose} disabled={isBusy} aria-label={t("app.close2")}>
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>

            <div className="workspace-dialog-body">
            <label className="workspace-dialog-field">
              <span>{t("app.workspaceName")}</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={t("app.fixStreamingToolResults")}
                disabled={isBusy}
              />
            </label>

            <label className="workspace-dialog-field">
              <span>{t("workspace.newBranch")}</span>
              <input value={branch} onChange={event => onBranchChange(event.target.value)} placeholder={t("workspace.newBranchPlaceholder")} disabled={isBusy} />
            </label>

            {children}
            {message && <p className="dialog-error">{message}</p>}

            </div>
            <footer>
              <button type="button" className="dialog-cancel" onClick={onClose} disabled={isBusy}>{t("app.cancel")}</button>
              <button
                type="submit"
                className="dialog-submit"
                disabled={
                  isBusy || !title.trim() || workspaceRepositories.some((draft) => draft.selected && !draft.repository.repository_id && !draft.baseRef.trim())
                }
              >
                {isBusy ? t("app.creating") : t("app.createWorkspace")}
              </button>
            </footer>
          </form>
        </div>
  );
}
