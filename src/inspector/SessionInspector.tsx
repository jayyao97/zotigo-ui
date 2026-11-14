import type { ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function SessionInspector({
  isBusy,
  onClose,
  onRefresh,
  children,
}: {
  isBusy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
      <aside className="inspector" aria-label={t("app.sessionDetails")}>
        <section className="inspector-card">
          <div className="inspector-heading">
            <h2>{t("app.environment")}</h2>
            <button type="button" className="icon-button" aria-label={t("app.closeSessionDetails")} onClick={onClose}><X size={14} /></button>
            <button type="button" className="icon-button" aria-label={t("app.refreshEnvironment")} onClick={onRefresh} disabled={isBusy}>
              <RefreshCw size={14} strokeWidth={1.8} />
            </button>
          </div>
          {children}
        </section>
      </aside>
  );
}
