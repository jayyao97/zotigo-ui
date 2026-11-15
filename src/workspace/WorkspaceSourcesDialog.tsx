import type { ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import { stateLabel } from "../../shared/i18n/display";
import type { DesktopProjectRepository, DesktopWorkspace } from "../../shared/clientTypes";

export function WorkspaceSourcesDialog({
  target,
  isBusy,
  loading,
  loadError,
  sourceId,
  selectedRepository,
  baseRef,
  message,
  onClose,
  onRetry,
  onConfirm,
  children,
}: {
  target: DesktopWorkspace;
  isBusy: boolean;
  loading: boolean;
  loadError: string | null;
  sourceId: string;
  selectedRepository: DesktopProjectRepository | undefined;
  baseRef: string;
  message: string | null;
  onClose: () => void;
  onRetry: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) onClose(); }}>
          <div className="create-project-dialog workspace-sources-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-sources-title">
            <header><div><h2 id="workspace-sources-title">{t("app.workspaceSources")}</h2><p>{target.title}</p></div><button type="button" className="dialog-close" disabled={isBusy} onClick={onClose} aria-label={t("app.close2")}><X size={15} /></button></header>
            {children}
            {!loadError && target.status !== "ready" && <div className="workspace-source-unavailable"><p>{t("workspace.unready", { state: stateLabel(target.status) })}</p>{target.status === "error" && <button type="button" disabled={isBusy} onClick={onRetry}><RefreshCw size={12} /> {t("app.retryWorkspace2")}</button>}</div>}
            {message && <p className="dialog-error">{message}</p>}
            <footer><button type="button" className="dialog-cancel" disabled={isBusy} onClick={onClose}>{t("app.close2")}</button><button type="button" className="dialog-submit" disabled={isBusy || target.status !== "ready" || loading || Boolean(loadError) || !sourceId || Boolean(selectedRepository && !selectedRepository.repository_id && !baseRef.trim())} onClick={onConfirm}>{t("app.addSource")}</button></footer>
          </div>
        </div>
  );
}
