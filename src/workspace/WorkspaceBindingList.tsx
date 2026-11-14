import { Folder, GitBranch, RefreshCw } from "lucide-react";
import { t } from "../../shared/i18n/index";
import { stateLabel } from "../../shared/i18n/display";
import type { CatalogWorkspaceSource } from "../../shared/zotigod";
import { formatDateTime, workspaceSourceName } from "../app/appHelpers";

export function WorkspaceBindingList({
  sources,
  loading,
  loadError,
  isBusy,
  onReload,
  onRetry,
}: {
  sources: CatalogWorkspaceSource[];
  loading: boolean;
  loadError: string | null;
  isBusy: boolean;
  onReload: () => void;
  onRetry: () => void;
}) {
  return (
            <section className="workspace-binding-list">
              <span>{t("app.dependencies")}</span>
              {loading && <p className="workspace-dialog-note">{t("app.loadingWorkspaceSources")}</p>}
              {!loading && loadError && <div className="workspace-source-load-error"><p>{loadError}</p><button type="button" onClick={onReload}>{t("app.reload")}</button></div>}
              {!loading && sources.map((binding) => <div className="workspace-binding-row" key={binding.source.id}>
                {binding.source.kind === "git" ? <GitBranch size={15} /> : <Folder size={15} />}
                <span><strong>{workspaceSourceName(binding)}</strong><small>{binding.source.kind === "git" ? `${binding.base_ref} → ${binding.branch_name}` : `${binding.mode} → ${binding.target_path}`}</small>{binding.used_cached_base && <small className="workspace-cache-notice">{binding.base_synced_at ? t("repositories.workspaceUsedCache", { time: formatDateTime(binding.base_synced_at) }) : t("repositories.workspaceUsedCacheUnknown")}</small>}{binding.error && <small className="error">{binding.error}</small>}</span>
                <div className="workspace-binding-status"><em className={binding.status === "error" ? "error" : ""}>{stateLabel(binding.status)}</em>{binding.status === "error" && <button type="button" disabled={isBusy} onClick={onRetry}><RefreshCw size={12} /> {t("app.retry2")}</button>}</div>
              </div>)}
              {!loading && !loadError && sources.length === 0 && <p className="workspace-dialog-note">{t("app.thisWorkspaceHasNoSourcesYet")}</p>}
            </section>
  );
}
