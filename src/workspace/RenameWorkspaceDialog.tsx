import type { FormEvent } from "react";
import { X } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function RenameWorkspaceDialog({
  titleDraft,
  message,
  isSaving,
  onTitleDraftChange,
  onClose,
  onSubmit,
}: {
  titleDraft: string;
  message: string | null;
  isSaving: boolean;
  onTitleDraftChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <form
        className="rename-conversation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-workspace-title"
        onSubmit={onSubmit}
      >
        <header>
          <div>
            <h2 id="rename-workspace-title">{t("app.renameWorkspace")}</h2>
            <p>{t("app.thisChangesTheDisplayNameOnly")}</p>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} disabled={isSaving} aria-label={t("app.close2")}>
            <X size={15} strokeWidth={1.8} />
          </button>
        </header>
        <label>
          <span className="sr-only">{t("app.workspaceName")}</span>
          <input
            autoFocus
            value={titleDraft}
            onChange={(event) => onTitleDraftChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            disabled={isSaving}
          />
        </label>
        {message && <p className="dialog-error">{message}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={onClose} disabled={isSaving}>{t("app.cancel")}</button>
          <button type="submit" className="dialog-submit" disabled={isSaving || !titleDraft.trim()}>
            {isSaving ? t("app.saving") : t("app.save")}
          </button>
        </footer>
      </form>
    </div>
  );
}
