import { X } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function RemoveSourceDialog({
  sourceName,
  message,
  isBusy,
  onClose,
  onConfirm,
}: {
  sourceName: string;
  message: string | null;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) onClose(); }} onKeyDown={(event) => { if (event.key === "Escape" && !isBusy) onClose(); }}>
      <div className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-source-title">
        <header><div><h2 id="remove-source-title">{t("app.removeSourceFromProject")}</h2><p>{sourceName}</p></div><button type="button" className="dialog-close" disabled={isBusy} onClick={onClose} aria-label={t("app.close2")}><X size={15} /></button></header>
        <p className="archive-workspace-copy">{t("app.thisOnlyRemovesTheSourceFromThisProject")}</p>
        {message && <p className="dialog-error">{message}</p>}
        <footer><button autoFocus type="button" className="dialog-cancel" disabled={isBusy} onClick={onClose}>{t("app.cancel")}</button><button type="button" className="dialog-submit" disabled={isBusy} onClick={onConfirm}>{isBusy ? t("app.removing") : t("app.removeFromProject")}</button></footer>
      </div>
    </div>
  );
}
