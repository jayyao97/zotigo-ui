import { Check, ChevronDown, Copy, Folder, FolderOpen, GitBranch, Laptop, Server } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { DesktopWorkspace } from "../../shared/clientTypes";
import { StatusPill } from "../app/StatusPill";
import type { ConnectionState } from "../app/appTypes";

export function SessionEnvironmentList({
  connectionState,
  remote,
  projectName,
  workspace,
  workingDirectory,
  copiedWorkspacePath,
  onCopyPath,
  onBrowseFiles,
}: {
  connectionState: ConnectionState;
  remote: boolean | undefined;
  projectName: string | undefined;
  workspace: DesktopWorkspace | null;
  workingDirectory: string | undefined;
  copiedWorkspacePath: string | null;
  onCopyPath: (path: string) => void;
  onBrowseFiles: (path: string) => void;
}) {
  return (
          <div className="env-list">
            <div className="env-row">
              <Server className="env-icon" size={15} strokeWidth={1.8} />
              <span>{t("app.daemon")}</span>
              <StatusPill state={connectionState} />
            </div>
            <div className="env-row">
              <Laptop className="env-icon" size={15} strokeWidth={1.8} />
              <span>{remote ? t("app.remoteHost") : t("app.localHost")}</span>
              <ChevronDown className="env-chevron" size={14} strokeWidth={1.8} />
            </div>
            <div className="env-row">
              <Folder className="env-icon" size={15} strokeWidth={1.8} />
              <span>{projectName ?? t("app.scratch")}</span>
              {workspace?.root_path && (
                <span className="env-row-actions">
                  <button type="button" className="icon-button" title={t("app.copyWorkspacePath")} aria-label={t("app.copyWorkspacePath")} onClick={() => onCopyPath(workspace.root_path)}>
                    {copiedWorkspacePath === workspace.root_path ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
                  </button>
                  <button type="button" className="icon-button" title={t("app.browseWorkspaceFiles")} aria-label={t("app.browseWorkspaceFiles")} onClick={() => onBrowseFiles(workspace.root_path)}>
                    <FolderOpen size={14} />
                  </button>
                </span>
              )}
            </div>
            <div className="env-row">
              <GitBranch className="env-icon" size={15} strokeWidth={1.8} />
              <span>{workspace?.title ?? t("app.noWorkspace")}</span>
            </div>
            {workingDirectory && workingDirectory !== workspace?.root_path && (
              <div className="env-row" title={workingDirectory}>
                <Folder className="env-icon" size={15} strokeWidth={1.8} />
                <span>{workingDirectory}</span>
                <span className="env-row-actions">
                  <button type="button" className="icon-button" title={t("app.copyWorkingDirectory")} aria-label={t("app.copyWorkingDirectory")} onClick={() => onCopyPath(workingDirectory)}>
                    {copiedWorkspacePath === workingDirectory ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
                  </button>
                  <button type="button" className="icon-button" title={t("app.browseWorkingDirectory")} aria-label={t("app.browseWorkingDirectory")} onClick={() => onBrowseFiles(workingDirectory)}>
                    <FolderOpen size={14} />
                  </button>
                </span>
              </div>
            )}
          </div>
  );
}
