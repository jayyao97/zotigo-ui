import type { FormEvent } from "react";
import { X } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function RenameConversationDialog({
  titleDraft,
  isSaving,
  onTitleDraftChange,
  onClose,
  onSubmit,
}: {
  titleDraft: string;
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
        className="rename-conversation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-conversation-title"
        onSubmit={onSubmit}
      >
        <header>
          <div>
            <h2 id="rename-conversation-title">{t("app.renameChat")}</h2>
            <p>{t("app.keepItShortAndEasyToRecognize")}</p>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={isSaving}
            aria-label={t("app.close2")}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </header>

        <label>
          <span className="sr-only">{t("app.conversationTitle")}</span>
          <input
            autoFocus
            value={titleDraft}
            onChange={(event) => onTitleDraftChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            disabled={isSaving}
          />
        </label>

        <footer>
          <button
            type="button"
            className="dialog-cancel"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("app.cancel")}</button>
          <button
            type="submit"
            className="dialog-submit"
            disabled={isSaving || !titleDraft.trim()}
          >
            {t("app.save")}</button>
        </footer>
      </form>
    </div>
  );
}
