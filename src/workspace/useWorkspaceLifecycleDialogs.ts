import { useState, type Dispatch, type SetStateAction } from "react";
import { t } from "../../shared/i18n/index";
import type { ClientApi, DesktopProject, DesktopState, DesktopWorkspace } from "../../shared/clientTypes";
import type { ProjectDeletePreview, WorkspaceArchivePreview } from "../../shared/zotigod";
import { errorMessage } from "../app/appHelpers";
import { copyText } from "../clipboard";

export interface WorkspaceLifecycleDialogsArgs {
  client: Pick<ClientApi, "previewWorkspaceArchive" | "archiveWorkspace" | "previewProjectDelete" | "deleteProject" | "previewWorkspaceDelete" | "deleteWorkspace">;
  isBusy: boolean;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setSidebarActionError: Dispatch<SetStateAction<string | null>>;
  setProjectMenuId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceMenuId: Dispatch<SetStateAction<string | null>>;
  // Called after a workspace was archived or deleted.
  clearProjectOverview: () => void;
  // Called after a project was deleted, with that project's id.
  clearProjectOverviewIfShowing: (projectId: string) => void;
}

export interface WorkspaceLifecycleDialogs {
  archiveWorkspaceTarget: DesktopWorkspace | null;
  workspaceArchivePreview: WorkspaceArchivePreview | null;
  setWorkspaceArchivePreview: Dispatch<SetStateAction<WorkspaceArchivePreview | null>>;
  deleteProjectTarget: DesktopProject | null;
  projectDeletePreview: ProjectDeletePreview | null;
  deleteProjectConfirmation: string;
  setDeleteProjectConfirmation: Dispatch<SetStateAction<string>>;
  deleteWorkspaceTarget: DesktopWorkspace | null;
  workspaceDeletePreview: WorkspaceArchivePreview | null;
  setWorkspaceDeletePreview: Dispatch<SetStateAction<WorkspaceArchivePreview | null>>;
  workspaceLifecycleError: string | null;
  deleteWorkspaceConfirmation: string;
  setDeleteWorkspaceConfirmation: Dispatch<SetStateAction<string>>;
  copiedWorkspacePath: string | null;
  openArchiveWorkspaceDialog: (workspace: DesktopWorkspace) => Promise<void>;
  closeArchiveWorkspaceDialog: () => void;
  confirmArchiveWorkspace: () => Promise<void>;
  openDeleteProjectDialog: (project: DesktopProject) => Promise<void>;
  closeDeleteProjectDialog: () => void;
  confirmDeleteProject: () => Promise<void>;
  openDeleteWorkspaceDialog: (workspace: DesktopWorkspace) => Promise<void>;
  closeDeleteWorkspaceDialog: () => void;
  confirmDeleteWorkspace: () => Promise<void>;
  copyWorkspacePath: (pathValue: string) => Promise<void>;
}

// Owns the archive-workspace, delete-workspace and delete-project confirmation dialogs:
// their targets, previews, typed confirmations, the shared error and the copied-path marker.
export function useWorkspaceLifecycleDialogs({
  client, isBusy, setIsBusy, applyDesktopState, setSidebarActionError, setProjectMenuId, setWorkspaceMenuId,
  clearProjectOverview, clearProjectOverviewIfShowing,
}: WorkspaceLifecycleDialogsArgs): WorkspaceLifecycleDialogs {
  const [archiveWorkspaceTarget, setArchiveWorkspaceTarget] = useState<DesktopWorkspace | null>(null);
  const [workspaceArchivePreview, setWorkspaceArchivePreview] = useState<WorkspaceArchivePreview | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<DesktopProject | null>(null);
  const [projectDeletePreview, setProjectDeletePreview] = useState<ProjectDeletePreview | null>(null);
  const [deleteProjectConfirmation, setDeleteProjectConfirmation] = useState("");
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] = useState<DesktopWorkspace | null>(null);
  const [workspaceDeletePreview, setWorkspaceDeletePreview] = useState<WorkspaceArchivePreview | null>(null);
  const [workspaceLifecycleError, setWorkspaceLifecycleError] = useState<string | null>(null);
  const [deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation] = useState("");
  const [copiedWorkspacePath, setCopiedWorkspacePath] = useState<string | null>(null);

  async function openArchiveWorkspaceDialog(workspace: DesktopWorkspace) {
    setWorkspaceMenuId(null);
    setSidebarActionError(null);
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const preview = await client.previewWorkspaceArchive(workspace.id);
      setWorkspaceArchivePreview(preview);
      setArchiveWorkspaceTarget(workspace);
      setCopiedWorkspacePath(null);
    } catch (error) {
      setSidebarActionError(t("app.couldNotInspect", { p0: workspace.title, p1: errorMessage(error) }));
    } finally {
      setIsBusy(false);
    }
  }

  function closeArchiveWorkspaceDialog() {
    if (isBusy) return;
    setArchiveWorkspaceTarget(null);
    setWorkspaceArchivePreview(null);
    setWorkspaceLifecycleError(null);
    setCopiedWorkspacePath(null);
  }

  async function confirmArchiveWorkspace() {
    if (!archiveWorkspaceTarget || !workspaceArchivePreview) return;
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const state = await client.archiveWorkspace(archiveWorkspaceTarget.id);
      applyDesktopState(state);
      clearProjectOverview();
      setArchiveWorkspaceTarget(null);
      setWorkspaceArchivePreview(null);
      setCopiedWorkspacePath(null);
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function openDeleteProjectDialog(project: DesktopProject) {
    setProjectMenuId(null);
    setSidebarActionError(null);
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const preview = await client.previewProjectDelete(project.id);
      setProjectDeletePreview(preview);
      setDeleteProjectTarget(project);
      setDeleteProjectConfirmation("");
    } catch (error) {
      setSidebarActionError(t("app.couldNotInspect", { p0: project.name, p1: errorMessage(error) }));
    } finally {
      setIsBusy(false);
    }
  }

  function closeDeleteProjectDialog() {
    if (isBusy) return;
    setDeleteProjectTarget(null);
    setProjectDeletePreview(null);
    setDeleteProjectConfirmation("");
    setWorkspaceLifecycleError(null);
  }

  async function confirmDeleteProject() {
    if (isBusy || !deleteProjectTarget || !projectDeletePreview || deleteProjectConfirmation !== deleteProjectTarget.name) return;
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const state = await client.deleteProject({ id: deleteProjectTarget.id, confirmation: deleteProjectConfirmation });
      applyDesktopState(state);
      clearProjectOverviewIfShowing(deleteProjectTarget.id);
      setDeleteProjectTarget(null);
      setProjectDeletePreview(null);
      setDeleteProjectConfirmation("");
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function openDeleteWorkspaceDialog(workspace: DesktopWorkspace) {
    setWorkspaceMenuId(null);
    setSidebarActionError(null);
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const preview = await client.previewWorkspaceDelete(workspace.id);
      setWorkspaceDeletePreview(preview);
      setDeleteWorkspaceTarget(workspace);
      setDeleteWorkspaceConfirmation("");
      setCopiedWorkspacePath(null);
    } catch (error) {
      setSidebarActionError(t("app.couldNotInspect", { p0: workspace.title, p1: errorMessage(error) }));
    } finally {
      setIsBusy(false);
    }
  }

  function closeDeleteWorkspaceDialog() {
    if (isBusy) return;
    setDeleteWorkspaceTarget(null);
    setWorkspaceDeletePreview(null);
    setWorkspaceLifecycleError(null);
    setDeleteWorkspaceConfirmation("");
    setCopiedWorkspacePath(null);
  }

  async function confirmDeleteWorkspace() {
    if (!deleteWorkspaceTarget || !workspaceDeletePreview) return;
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const state = await client.deleteWorkspace({
        id: deleteWorkspaceTarget.id,
        confirmation: deleteWorkspaceConfirmation,
      });
      applyDesktopState(state);
      clearProjectOverview();
      setDeleteWorkspaceTarget(null);
      setWorkspaceDeletePreview(null);
      setDeleteWorkspaceConfirmation("");
      setCopiedWorkspacePath(null);
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyWorkspacePath(pathValue: string) {
    try {
      await copyText(pathValue);
      setCopiedWorkspacePath(pathValue);
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    }
  }

  return {
    archiveWorkspaceTarget, workspaceArchivePreview, setWorkspaceArchivePreview,
    deleteProjectTarget, projectDeletePreview, deleteProjectConfirmation, setDeleteProjectConfirmation,
    deleteWorkspaceTarget, workspaceDeletePreview, setWorkspaceDeletePreview,
    workspaceLifecycleError, deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation, copiedWorkspacePath,
    openArchiveWorkspaceDialog, closeArchiveWorkspaceDialog, confirmArchiveWorkspace,
    openDeleteProjectDialog, closeDeleteProjectDialog, confirmDeleteProject,
    openDeleteWorkspaceDialog, closeDeleteWorkspaceDialog, confirmDeleteWorkspace,
    copyWorkspacePath,
  };
}
