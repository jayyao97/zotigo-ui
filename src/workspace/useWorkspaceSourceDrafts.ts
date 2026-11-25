import { useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ClientApi, DesktopProject, DesktopState, DesktopWorkspace } from "../../shared/clientTypes";
import { t } from "../../shared/i18n/index";
import { initialWorkspaceSourceSelection, workspaceSourceMatches } from "../../shared/workspaceSourceSelection";
import type { CatalogWorkspaceSource, FolderSourceMode } from "../../shared/zotigod";
import { errorMessage } from "../app/appHelpers";
import type { WorkspaceRepositoryDraft } from "../app/appTypes";

export interface WorkspaceSourceDraftsArgs {
  client: Pick<ClientApi, "createWorkspace" | "getDesktopState" | "getWorkspaceSources" | "addWorkspaceSource" | "retryWorkspace">;
  desktopState: DesktopState;
  isBusy: boolean;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setRepositoriesOpen: Dispatch<SetStateAction<boolean>>;
  // Called after a workspace was created, with its project id, so the new workspace is visible in the sidebar.
  expandProject: (projectId: string) => void;
  // True while the app is switching hosts; results that arrive then are dropped.
  isHostSwitching: () => boolean;
}

export interface WorkspaceSourceDrafts {
  createWorkspaceProject: DesktopProject | null;
  newWorkspaceTitle: string;
  newWorkspaceBranch: string;
  setNewWorkspaceBranch: Dispatch<SetStateAction<string>>;
  workspaceSourceQuery: string;
  setWorkspaceSourceQuery: Dispatch<SetStateAction<string>>;
  workspaceRepositories: WorkspaceRepositoryDraft[];
  setWorkspaceRepositories: Dispatch<SetStateAction<WorkspaceRepositoryDraft[]>>;
  workspaceFolderModes: Record<string, "" | FolderSourceMode>;
  setWorkspaceFolderModes: Dispatch<SetStateAction<Record<string, "" | FolderSourceMode>>>;
  workspaceSourcesTarget: DesktopWorkspace | null;
  workspaceSources: CatalogWorkspaceSource[];
  workspaceSourcesLoading: boolean;
  workspaceSourcesLoadError: string | null;
  workspaceSourceId: string;
  workspaceSourceBaseRef: string;
  setWorkspaceSourceBaseRef: Dispatch<SetStateAction<string>>;
  workspaceSourceMode: FolderSourceMode;
  setWorkspaceSourceMode: Dispatch<SetStateAction<FolderSourceMode>>;
  visibleWorkspaceRepositories: WorkspaceRepositoryDraft[];
  visibleWorkspaceFolders: DesktopState["folders"];
  selectedWorkspaceSourceCount: number;
  canSelectAllWorkspaceSources: boolean;
  canDeselectAllWorkspaceSources: boolean;
  openCreateWorkspaceDialog: (project: DesktopProject) => void;
  selectAllWorkspaceSources: (selected: boolean) => void;
  closeCreateWorkspaceDialog: () => void;
  updateNewWorkspaceTitle: (title: string) => void;
  updateRepositoryBaseRef: (repositoryId: string, baseRef: string) => void;
  submitCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  // Opens the workspace-sources panel; with loadedSources it shows them without fetching.
  openWorkspaceSources: (workspace: DesktopWorkspace, loadedSources?: CatalogWorkspaceSource[]) => Promise<void>;
  loadWorkspaceSources: (workspaceId: string) => Promise<void>;
  closeWorkspaceSources: () => void;
  selectWorkspaceSource: (sourceId: string) => void;
  confirmAddWorkspaceSource: () => Promise<void>;
  retryWorkspaceSourceBindings: () => Promise<void>;
}

// Owns the create-workspace dialog drafts (title, branch, source selection) and the
// workspace-sources panel (target, loaded bindings, the source being added).
export function useWorkspaceSourceDrafts({
  client, desktopState, isBusy, setIsBusy, setMessage, applyDesktopState, setRepositoriesOpen, expandProject, isHostSwitching,
}: WorkspaceSourceDraftsArgs): WorkspaceSourceDrafts {
  const [createWorkspaceProjectId, setCreateWorkspaceProjectId] = useState<string | null>(null);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState("");
  const [newWorkspaceBranch, setNewWorkspaceBranch] = useState("");
  const [workspaceSourceQuery, setWorkspaceSourceQuery] = useState("");
  const [workspaceRepositories, setWorkspaceRepositories] = useState<WorkspaceRepositoryDraft[]>([]);
  const [workspaceFolderModes, setWorkspaceFolderModes] = useState<Record<string, "" | FolderSourceMode>>({});
  const [workspaceSourcesTarget, setWorkspaceSourcesTarget] = useState<DesktopWorkspace | null>(null);
  const [workspaceSources, setWorkspaceSources] = useState<CatalogWorkspaceSource[]>([]);
  const [workspaceSourcesLoading, setWorkspaceSourcesLoading] = useState(false);
  const [workspaceSourcesLoadError, setWorkspaceSourcesLoadError] = useState<string | null>(null);
  const workspaceSourcesRequestRef = useRef(0);
  const [workspaceSourceId, setWorkspaceSourceId] = useState("");
  const [workspaceSourceBaseRef, setWorkspaceSourceBaseRef] = useState("HEAD");
  const [workspaceSourceMode, setWorkspaceSourceMode] = useState<FolderSourceMode>("direct");
  const createWorkspaceProject = useMemo(
    () => desktopState.projects.find((project) => project.id === createWorkspaceProjectId) ?? null,
    [createWorkspaceProjectId, desktopState.projects],
  );

  function openCreateWorkspaceDialog(project: DesktopProject) {
    const repositories = desktopState.repositories.filter((candidate) => candidate.project_id === project.id);
    const folders = desktopState.folders.filter((candidate) => candidate.project_id === project.id);
    const selection = initialWorkspaceSourceSelection(repositories, folders);
    setMessage(null);
    setNewWorkspaceTitle("");
    setNewWorkspaceBranch("");
    setWorkspaceSourceQuery("");
    setWorkspaceRepositories(repositories.map((repository) => ({
      repository,
      selected: selection.repositoryIds.includes(repository.id),
      baseRef: repository.repository_id ? "" : repository.default_base_ref || "HEAD",
    })));
    setWorkspaceFolderModes(selection.folderModes);
    setCreateWorkspaceProjectId(project.id);
  }

  const visibleWorkspaceRepositories = workspaceRepositories.filter(draft => workspaceSourceMatches(draft.repository, workspaceSourceQuery));
  const visibleWorkspaceFolders = desktopState.folders.filter(folder => folder.project_id === createWorkspaceProject?.id && workspaceSourceMatches(folder, workspaceSourceQuery));
  const availableWorkspaceFolders = visibleWorkspaceFolders.filter(folder => folder.availability === "available");
  const selectedWorkspaceSourceCount = workspaceRepositories.filter(draft => draft.selected).length + Object.values(workspaceFolderModes).filter(Boolean).length;
  const canSelectAllWorkspaceSources = visibleWorkspaceRepositories.some((draft) => draft.repository.availability === "available" && !draft.selected)
    || availableWorkspaceFolders.some((folder) => !workspaceFolderModes[folder.id]);
  const canDeselectAllWorkspaceSources = visibleWorkspaceRepositories.some((draft) => draft.repository.availability === "available" && draft.selected)
    || availableWorkspaceFolders.some((folder) => Boolean(workspaceFolderModes[folder.id]));

  function selectAllWorkspaceSources(selected: boolean) {
    if (!createWorkspaceProject || isBusy) return;
    setWorkspaceRepositories((current) => current.map((draft) => draft.repository.availability === "available" && workspaceSourceMatches(draft.repository, workspaceSourceQuery) ? { ...draft, selected } : draft));
    setWorkspaceFolderModes((current) => {
      const next = { ...current };
      for (const folder of desktopState.folders) {
        if (folder.project_id === createWorkspaceProject.id && folder.availability === "available" && workspaceSourceMatches(folder, workspaceSourceQuery)) {
          next[folder.id] = selected ? current[folder.id] || folder.default_mode : "";
        }
      }
      return next;
    });
  }

  function closeCreateWorkspaceDialog() {
    if (!isBusy) {
      setCreateWorkspaceProjectId(null);
    }
  }

  function updateNewWorkspaceTitle(title: string) {
    setNewWorkspaceTitle(title);
  }

  function updateRepositoryBaseRef(repositoryId: string, baseRef: string) {
    setWorkspaceRepositories((current) => current.map((draft) => draft.repository.id === repositoryId
      ? { ...draft, baseRef }
      : draft));
  }

  function submitCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createWorkspaceFromDraft();
  }

  async function createWorkspaceFromDraft() {
    if (!createWorkspaceProjectId || !newWorkspaceTitle.trim()) {
      return;
    }
    const projectId = createWorkspaceProjectId;
    const modes = workspaceFolderModes;
    let createdWorkspace: DesktopWorkspace | undefined;
    setIsBusy(true);
    setMessage(null);
    try {
      const folders = Object.entries(modes)
        .filter((entry): entry is [string, FolderSourceMode] => entry[1] !== "")
        .map(([folderId, mode]) => ({ folderId, mode }));
      const state = await client.createWorkspace({
        projectId,
        title: newWorkspaceTitle.trim(),
        branchName: newWorkspaceBranch.trim() || undefined,
        repositories: workspaceRepositories.filter((draft) => draft.selected).map((draft) => ({
          repositoryId: draft.repository.id,
          baseRef: draft.baseRef,
        })),
        folders,
      });
      applyDesktopState(state);
      createdWorkspace = state.workspaces.find(workspace => workspace.id === state.selectedWorkspaceId);
      expandProject(projectId);
      setCreateWorkspaceProjectId(null);
      setRepositoriesOpen(false);
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    } finally {
      setIsBusy(false);
    }
    if (createdWorkspace && !isHostSwitching()) {
      const requestId = ++workspaceSourcesRequestRef.current;
      try {
        const sources = await client.getWorkspaceSources(createdWorkspace.id);
        if (!isHostSwitching() && workspaceSourcesRequestRef.current === requestId && sources.some(source => source.used_cached_base)) {
          await openWorkspaceSources(createdWorkspace, sources);
        }
      } catch (error) {
        if (!isHostSwitching() && workspaceSourcesRequestRef.current === requestId) {
          setMessage(t("repositories.createdSourcesUnavailable", { error: errorMessage(error) }));
        }
      }
    }
  }

  async function openWorkspaceSources(workspace: DesktopWorkspace, loadedSources?: CatalogWorkspaceSource[]) {
    setMessage(null);
    setWorkspaceSourcesTarget(workspace);
    setWorkspaceSources(loadedSources ?? []);
    setWorkspaceSourceId("");
    setWorkspaceSourceBaseRef("HEAD");
    if (loadedSources) {
      workspaceSourcesRequestRef.current++;
      setWorkspaceSourcesLoadError(null);
      setWorkspaceSourcesLoading(false);
    } else {
      await loadWorkspaceSources(workspace.id);
    }
  }

  async function loadWorkspaceSources(workspaceId: string) {
    const requestId = ++workspaceSourcesRequestRef.current;
    setWorkspaceSourcesLoading(true);
    setWorkspaceSourcesLoadError(null);
    try {
      const sources = await client.getWorkspaceSources(workspaceId);
      if (workspaceSourcesRequestRef.current === requestId) setWorkspaceSources(sources);
    } catch (error) {
      if (workspaceSourcesRequestRef.current === requestId) {
        setWorkspaceSources([]);
        setWorkspaceSourcesLoadError(errorMessage(error));
      }
    } finally {
      if (workspaceSourcesRequestRef.current === requestId) setWorkspaceSourcesLoading(false);
    }
  }

  function closeWorkspaceSources() {
    workspaceSourcesRequestRef.current += 1;
    setWorkspaceSourcesTarget(null);
    setWorkspaceSourcesLoading(false);
  }

  function selectWorkspaceSource(sourceId: string) {
    setWorkspaceSourceId(sourceId);
    const repository = desktopState.repositories.find((source) => source.id === sourceId);
    const folder = desktopState.folders.find((source) => source.id === sourceId);
    setWorkspaceSourceBaseRef(repository?.repository_id ? "" : repository?.default_base_ref || "HEAD");
    setWorkspaceSourceMode(folder?.default_mode ?? "direct");
  }

  async function confirmAddWorkspaceSource() {
    if (!workspaceSourcesTarget || !workspaceSourceId) return;
    const repository = desktopState.repositories.find((source) => source.id === workspaceSourceId);
    const folder = desktopState.folders.find((source) => source.id === workspaceSourceId);
    setIsBusy(true);
    setMessage(null);
    try {
      const sources = await client.addWorkspaceSource(workspaceSourcesTarget.id, {
        sourceId: workspaceSourceId,
        ...(repository ? { baseRef: workspaceSourceBaseRef } : {}),
        ...(folder ? { mode: workspaceSourceMode } : {}),
      });
      setWorkspaceSources(sources);
      setWorkspaceSourceId("");
    } catch (error) {
      setMessage(errorMessage(error));
      await loadWorkspaceSources(workspaceSourcesTarget.id);
    } finally {
      setIsBusy(false);
    }
  }

  async function retryWorkspaceSourceBindings() {
    if (!workspaceSourcesTarget) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const state = await client.retryWorkspace(workspaceSourcesTarget.id);
      applyDesktopState(state);
      const repaired = state.workspaces.find((workspace) => workspace.id === workspaceSourcesTarget.id);
      if (repaired) setWorkspaceSourcesTarget(repaired);
      await loadWorkspaceSources(workspaceSourcesTarget.id);
    } catch (error) {
      setMessage(errorMessage(error));
      await loadWorkspaceSources(workspaceSourcesTarget.id);
    } finally {
      setIsBusy(false);
    }
  }

  return {
    createWorkspaceProject, newWorkspaceTitle, newWorkspaceBranch, setNewWorkspaceBranch,
    workspaceSourceQuery, setWorkspaceSourceQuery,
    workspaceRepositories, setWorkspaceRepositories, workspaceFolderModes, setWorkspaceFolderModes,
    workspaceSourcesTarget, workspaceSources, workspaceSourcesLoading, workspaceSourcesLoadError,
    workspaceSourceId, workspaceSourceBaseRef, setWorkspaceSourceBaseRef, workspaceSourceMode, setWorkspaceSourceMode,
    visibleWorkspaceRepositories, visibleWorkspaceFolders, selectedWorkspaceSourceCount,
    canSelectAllWorkspaceSources, canDeselectAllWorkspaceSources,
    openCreateWorkspaceDialog, selectAllWorkspaceSources, closeCreateWorkspaceDialog, updateNewWorkspaceTitle,
    updateRepositoryBaseRef, submitCreateWorkspace,
    openWorkspaceSources, loadWorkspaceSources, closeWorkspaceSources, selectWorkspaceSource,
    confirmAddWorkspaceSource, retryWorkspaceSourceBindings,
  };
}
