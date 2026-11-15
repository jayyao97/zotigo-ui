import type { RefObject } from "react";
import { FileText, MoreHorizontal } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function ConversationTitle({
  title,
  isEditing,
  draft,
  isSaving,
  inputRef,
  onDraftChange,
  onSave,
  onCancel,
  onBeginEdit,
}: {
  title: string;
  isEditing: boolean;
  draft: string;
  isSaving: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onBeginEdit: () => void;
}) {
  return (
            <>
              <div className="title-with-icon">
                <FileText className="doc-icon" size={15} strokeWidth={1.8} />
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className="conversation-title-input"
                    value={draft}
                    disabled={isSaving}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onBlur={onSave}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) {
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onSave();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        onCancel();
                      }
                    }}
                    aria-label={t("app.conversationTitle")}
                  />
                ) : (
                  <button
                    type="button"
                    className="conversation-title-button"
                    onDoubleClick={onBeginEdit}
                    title={t("app.renameConversation")}
                  >
                    <h1>{title}</h1>
                  </button>
                )}
              </div>
              <button type="button" className="icon-button" aria-label={t("app.moreActions")} disabled title={t("app.moreActionsAreNotAvailableYet")}>
                <MoreHorizontal size={17} strokeWidth={1.8} />
              </button>
            </>
  );
}
