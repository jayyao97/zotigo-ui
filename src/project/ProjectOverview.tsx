import { Folder, FolderOpen, GitBranch, Plus, SquarePen, X } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { DesktopProject, DesktopState, DesktopWorkspace } from "../../shared/clientTypes";
import { useLocale } from "../i18n";
import { folderModeLabel, pathJoinForUi } from "../app/appHelpers";

export function ProjectOverview({
  project, state, message, onAddSources, onRename, onRemoveSource,
  onCreateWorkspace, onManageWorkspaceSources, onOpenPath,
}: {
  project: DesktopProject;
  state: DesktopState;
  message: string | null;
  onAddSources: () => void;
  onRename: () => void;
  onRemoveSource: (kind: "git" | "folder", sourceId: string, name: string) => void;
  onCreateWorkspace: () => void;
  onManageWorkspaceSources: (workspace: DesktopWorkspace) => void;
  onOpenPath?: (path: string) => void;
}) {
  useLocale();
  const repositories = state.repositories.filter((source) => source.project_id === project.id);
  const folders = state.folders.filter((source) => source.project_id === project.id);
  const workspaces = state.workspaces.filter((workspace) => workspace.project_id === project.id);
  return <div className="project-overview">
    <header>
      <div><FolderOpen size={22} /><span><button type="button" className="project-overview-title" onClick={onRename} title={t("app.renameProject")}><h2>{project.name}</h2><SquarePen size={14} /></button><p>{t("app.sourcesAndWorkspacesManagedByZotigod")}</p></span></div>
      <button type="button" className="dialog-submit" onClick={onCreateWorkspace}><Plus size={14} /> {t("app.newWorkspace")}</button>
    </header>
    {message && <p className="dialog-error">{message}</p>}
    <section className="project-overview-card">
      <div className="project-overview-heading"><h3>{t("app.sources")}</h3><button type="button" onClick={onAddSources}><Plus size={13} /> {t("app.addSource2")}</button></div>
      {repositories.map((source) => <div className="project-source-row" key={source.id}>
        <GitBranch size={15} />{source.repository_id ? <span className="managed-project-source"><strong>{source.name}</strong><small>{source.remote_url}</small></span> : <button type="button" className="source-path-button" disabled={!onOpenPath} title={t("app.browseFiles")} onClick={() => onOpenPath?.(source.source_path)}><strong>{source.name}</strong><small>{source.source_path}</small></button>}
        <button type="button" onClick={() => onRemoveSource("git", source.id, source.name)} aria-label={t("app.removeFromProject2", { p0: source.name })}><X size={13} /></button>
      </div>)}
      {folders.map((source) => <div className="project-source-row" key={source.id}>
          <Folder size={15} /><button type="button" className="source-path-button" disabled={!onOpenPath} title={t("app.browseFiles")} onClick={() => onOpenPath?.(source.source_path)}><strong>{source.name}</strong><small>{source.source_path}</small></button>
          <div className="source-row-actions"><em>{folderModeLabel(source.default_mode)}</em></div><button type="button" onClick={() => onRemoveSource("folder", source.id, source.name)} aria-label={t("app.removeFromProject2", { p0: source.name })}><X size={13} /></button>
        </div>)}
      {repositories.length === 0 && folders.length === 0 && <p className="project-overview-empty">{t("app.noSourcesEmptyWorkspacesAreSupported")}</p>}
    </section>
    <section className="project-overview-card">
      <div className="project-overview-heading"><h3>{t("app.workspaces")}</h3></div>
      {workspaces.map((workspace) => <div className="workspace-overview-row" key={workspace.id}>
        <GitBranch size={15} /><span><strong>{workspace.title}</strong><small>{workspace.root_path}</small></span>
        <><button type="button" onClick={() => onManageWorkspaceSources(workspace)}>{t("app.sources")}</button>{onOpenPath && <><button type="button" onClick={() => onOpenPath(pathJoinForUi(workspace.root_path, "artifacts"))}>{t("app.artifacts")}</button><button type="button" onClick={() => onOpenPath(pathJoinForUi(workspace.root_path, "notes"))}>{t("app.notes")}</button></>}</>
      </div>)}
      {workspaces.length === 0 && <p className="project-overview-empty">{t("app.noWorkspacesYet")}</p>}
    </section>
  </div>;
}
