import path from "node:path";
import type { NavigationItem } from "../shared/clientTypes";
import { mapWithConcurrency } from "../shared/asyncConcurrency";
import { orderSidebarItems } from "../shared/sidebarOrdering";
import type { CatalogWorkspaceSource, CatalogProjectDetail, WorkspaceArchivePreview, WorkspaceDeletePreview } from "../shared/zotigod";
import type { AddWorkspaceSourceInput, CreateProjectInput, CreateWorkspaceInput, DaemonSessionBinding, DesktopConversation, DesktopProject, DesktopProjectFolder, DesktopProjectRepository, DesktopState, DesktopWorkspace, ProjectSourceInput } from "../shared/clientTypes";
import { getCatalogOrder, getCatalogSelection, setCatalogSelection } from "./preferencesStore";
import {
  getCatalogNavigation,
  importCatalogNavigation,
  reorderCatalogNavigation,
  setCatalogNavigationPinned,
  addCatalogWorkspaceSource,
  addCatalogSource,
  archiveCatalogSession,
  archiveCatalogWorkspace,
  createCatalogProject,
  createCatalogWorkspace,
  deleteCatalogSource,
  deleteCatalogProject,
  previewCatalogProjectDelete,
  deleteCatalogWorkspace,
  getCatalogProject,
  getCatalogWorkspace,
  inspectCatalogSource,
  listCatalogProjects,
  listCatalogSessions,
  listCatalogWorkspaces,
  listCatalogWorkspaceSources,
  previewCatalogWorkspaceArchive,
  previewCatalogWorkspaceDelete,
  renameCatalogProject,
  renameCatalogWorkspace,
  retryCatalogWorkspace,
  setCatalogSessionPinned,
  setCatalogSessionTitle,
} from "./zotigod";

const catalogRequestConcurrency = 4;

export interface CatalogSelectionStore {
  getCatalogSelection: typeof getCatalogSelection;
  setCatalogSelection: typeof setCatalogSelection;
}

export function createCatalogService(selection: CatalogSelectionStore = { getCatalogSelection, setCatalogSelection }) {
  const { getCatalogSelection, setCatalogSelection } = selection;
  async function getCatalogDesktopState(options: { syncCodex?: boolean } = {}): Promise<DesktopState> {
    const projects = await listCatalogProjects();
    let navigation = await getCatalogNavigation();

    const [projectCatalogs, projections] = await Promise.all([
      mapWithConcurrency(projects, catalogRequestConcurrency, async (project) => {
        const [detail, workspaces] = await Promise.all([
          getCatalogProject(project.id),
          listCatalogWorkspaces(project.id),
        ]);
        return { detail, workspaces };
      }),
      listCatalogSessions(options),
    ]);
    if (!navigation.legacyOrderImported) {
      const savedPins = getCatalogOrder("pinnedSessions");
      const importedPins = [...navigation.pinned].sort((left, right) => {
        const leftPosition = left.kind === "session" ? savedPins.indexOf(left.id) : -1;
        const rightPosition = right.kind === "session" ? savedPins.indexOf(right.id) : -1;
        return (leftPosition < 0 ? Number.MAX_SAFE_INTEGER : leftPosition) - (rightPosition < 0 ? Number.MAX_SAFE_INTEGER : rightPosition);
      });
      await importCatalogNavigation([
        { scope: "projects", items: orderSidebarItems(projects, getCatalogOrder("projects")).map(({ id }) => ({ kind: "project", id })) },
        { scope: "pinned", items: importedPins },
        ...projectCatalogs.map(({ detail, workspaces }) => ({ scope: "workspaces", parent_id: detail.id,
          items: orderSidebarItems(workspaces, getCatalogOrder(`workspaces.${detail.id}`)).map(({ id }) => ({ kind: "workspace" as const, id })) })),
      ]);
      navigation = await getCatalogNavigation();
    }
    const details = projectCatalogs.map(({ detail }) => detail);
    const workspaceGroups = projectCatalogs.map(({ workspaces }) => workspaces);
    const repositories = details.flatMap(projectRepositories);
    const folders = details.flatMap(projectFolders);
    const workspaces = orderSidebarItems(workspaceGroups.flat(), navigation.workspaces.map((item) => item.id));
    const conversations = projections.flatMap((projection): DesktopConversation[] => {
      if (!projection.runtime) return [];
      const organization = projection.organization;
      return [{
        id: projection.runtime.id,
        project_id: organization?.project_id ?? null,
        workspace_id: organization?.workspace_id ?? null,
        title: organization?.title?.trim() || "New session",
        pinned_at: organization?.pinned_at ?? undefined,
        pinned_order: organization?.pinned_position ?? undefined,
        workspace_position: organization?.workspace_position ?? undefined,
        created_at: organization?.created_at ?? projection.runtime.created_at,
        updated_at: latestTimestamp(organization?.updated_at, projection.runtime.updated_at, projection.runtime.created_at),
      }];
    });
    const orderedConversations = conversations.sort((left, right) =>
      (left.workspace_position ?? Number.MAX_SAFE_INTEGER) - (right.workspace_position ?? Number.MAX_SAFE_INTEGER)
      || right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id));
    const bindings: DaemonSessionBinding[] = projections.flatMap((projection) => projection.runtime ? [{
      conversation_id: projection.runtime.id,
      daemon_session_id: projection.runtime.id,
      state: projection.runtime.state,
      error: projection.runtime.error,
      daemon_created_at: projection.runtime.created_at,
      daemon_started_at: projection.runtime.started_at,
      daemon_ended_at: projection.runtime.ended_at,
      created_at: projection.runtime.created_at,
    }] : []);
    const orderedProjects = orderSidebarItems(projects, navigation.projects.map((item) => item.id));
    const selection = reconcileSelection(
      getCatalogSelection(),
      orderedProjects,
      workspaces,
      orderedConversations,
    );
    setCatalogSelection(selection);
    return {
      pinnedItems: navigation.pinned,
      projects: orderedProjects,
      repositories,
      folders,
      workspaces,
      conversations: orderedConversations,
      bindings,
      selectedProjectId: selection.projectId,
      selectedWorkspaceId: selection.workspaceId,
      selectedConversationId: selection.sessionId,
    };
  }

  function latestTimestamp(...values: Array<string | undefined>): string {
    return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? "";
  }

  async function createProjectInCatalog(input: CreateProjectInput): Promise<DesktopState> {
    const project = await createCatalogProject(input.name.trim());
    const sources = input.sources ?? [];
    await addSourcesToCatalog(project.id, sources);
    setCatalogSelection({ projectId: project.id, workspaceId: null, sessionId: null });
    return getCatalogDesktopState();
  }

  async function renameProjectInCatalog(id: string, name: string): Promise<DesktopState> {
    await renameCatalogProject(id, name.trim());
    return getCatalogDesktopState();
  }

  async function addSourcesToCatalog(projectId: string, sources: ProjectSourceInput[]): Promise<DesktopState> {
    for (const source of sources) {
      const inspection = await inspectCatalogSource(source.path);
      await addCatalogSource(projectId, source.path, inspection.kind === "folder" ? (source.folderMode ?? "direct") : undefined);
    }
    return getCatalogDesktopState();
  }

  async function removeSourceFromCatalog(sourceId: string): Promise<DesktopState> {
    const state = await getCatalogDesktopState();
    const source = [...state.repositories, ...state.folders].find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error(`source not found: ${sourceId}`);
    await deleteCatalogSource(source.project_id, sourceId);
    return getCatalogDesktopState();
  }

  async function createWorkspaceInCatalog(input: CreateWorkspaceInput): Promise<DesktopState> {
    const sources = [
      ...(input.repositories ?? []).map((source) => ({
        source_id: source.repositoryId,
        base_ref: source.baseRef,
        ...(input.branchName?.trim() ? { branch_name: input.branchName.trim() } : {}),
      })),
      ...(input.folders ?? []).map((source) => ({ source_id: source.folderId, mode: source.mode })),
    ];
    const workspace = await createCatalogWorkspace(input.projectId, input.title.trim(), sources);
    setCatalogSelection({ projectId: input.projectId, workspaceId: workspace.id, sessionId: null });
    return getCatalogDesktopState();
  }

  function getWorkspaceSourcesFromCatalog(id: string): Promise<CatalogWorkspaceSource[]> {
    return listCatalogWorkspaceSources(id);
  }

  async function addWorkspaceSourceToCatalog(
    id: string,
    input: AddWorkspaceSourceInput,
  ): Promise<CatalogWorkspaceSource[]> {
    await addCatalogWorkspaceSource(id, {
      source_id: input.sourceId,
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.baseRef?.trim() ? { base_ref: input.baseRef.trim() } : {}),
      ...(input.branchName?.trim() ? { branch_name: input.branchName.trim() } : {}),
    });
    return listCatalogWorkspaceSources(id);
  }

  async function retryWorkspaceInCatalog(id: string): Promise<DesktopState> {
    await retryCatalogWorkspace(id);
    return getCatalogDesktopState();
  }

  async function renameWorkspaceInCatalog(id: string, title: string): Promise<DesktopState> {
    await renameCatalogWorkspace(id, title.trim());
    return getCatalogDesktopState();
  }

  async function previewWorkspaceArchiveInCatalog(id: string): Promise<WorkspaceArchivePreview> {
    const [impact, workspace] = await Promise.all([previewCatalogWorkspaceArchive(id), getCatalogWorkspace(id)]);
    return { ...impact, workspace_title: workspace.title, root_path: workspace.root_path };
  }

  async function previewWorkspaceDeleteInCatalog(id: string): Promise<WorkspaceDeletePreview> {
    const [impact, workspace] = await Promise.all([previewCatalogWorkspaceDelete(id), getCatalogWorkspace(id)]);
    return { ...impact, workspace_title: workspace.title, root_path: workspace.root_path };
  }

  async function archiveWorkspaceInCatalog(id: string): Promise<DesktopState> {
    await archiveCatalogWorkspace(id);
    const selection = getCatalogSelection();
    if (selection.workspaceId === id) setCatalogSelection({ projectId: selection.projectId, workspaceId: null, sessionId: null });
    return getCatalogDesktopState();
  }

  async function deleteWorkspaceInCatalog(id: string, confirmation: string): Promise<DesktopState> {
    await deleteCatalogWorkspace(id, confirmation);
    const selection = getCatalogSelection();
    if (selection.workspaceId === id) setCatalogSelection({ projectId: selection.projectId, workspaceId: null, sessionId: null });
    return getCatalogDesktopState();
  }

  async function deleteProjectInCatalog(id: string, confirmation: string): Promise<DesktopState> {
    await deleteCatalogProject(id, confirmation);
    if (getCatalogSelection().projectId === id) {
      setCatalogSelection({ projectId: null, workspaceId: null, sessionId: null });
    }
    return getCatalogDesktopState();
  }

  async function selectCatalogProject(id: string | null): Promise<DesktopState> {
    setCatalogSelection({ projectId: id, workspaceId: null, sessionId: null });
    return getCatalogDesktopState();
  }

  async function selectCatalogWorkspace(id: string | null): Promise<DesktopState> {
    if (id === null) {
      const selection = getCatalogSelection();
      setCatalogSelection({ ...selection, workspaceId: null, sessionId: null });
    } else {
      const workspace = await getCatalogWorkspace(id);
      setCatalogSelection({ projectId: workspace.project_id, workspaceId: id, sessionId: null });
    }
    return getCatalogDesktopState();
  }

  async function selectCatalogSession(id: string | null): Promise<DesktopState> {
    if (id === null) {
      const selection = getCatalogSelection();
      setCatalogSelection({ ...selection, sessionId: null });
    } else {
      const state = await getCatalogDesktopState();
      const conversation = state.conversations.find((candidate) => candidate.id === id);
      if (!conversation) throw new Error(`session not found: ${id}`);
      setCatalogSelection({ projectId: conversation.project_id, workspaceId: conversation.workspace_id, sessionId: id });
      return {
        ...state,
        selectedProjectId: conversation.project_id,
        selectedWorkspaceId: conversation.workspace_id,
        selectedConversationId: id,
      };
    }
    return getCatalogDesktopState();
  }

  async function renameCatalogConversation(id: string, title: string): Promise<DesktopState> {
    await setCatalogSessionTitle(id, title);
    return getCatalogDesktopState();
  }

  async function pinCatalogConversation(id: string, pinned: boolean): Promise<DesktopState> {
    await setCatalogSessionPinned(id, pinned);
    return getCatalogDesktopState();
  }

  async function archiveCatalogConversation(id: string): Promise<DesktopState> {
    await archiveCatalogSession(id);
    const selection = getCatalogSelection();
    if (selection.sessionId === id) setCatalogSelection({ ...selection, sessionId: null });
    return getCatalogDesktopState();
  }

  async function reorderCatalogProjects(ids: string[]): Promise<DesktopState> {
    await reorderCatalogNavigation("projects", ids.map((id) => ({ kind: "project", id })));
    return getCatalogDesktopState();
  }

  async function reorderCatalogWorkspaces(projectId: string, ids: string[]): Promise<DesktopState> {
    await reorderCatalogNavigation("workspaces", ids.map((id) => ({ kind: "workspace", id })), projectId);
    return getCatalogDesktopState();
  }

  async function reorderCatalogWorkspaceSessions(ids: string[]): Promise<DesktopState> {
    if (!ids.length) return getCatalogDesktopState();
    const projections = await listCatalogSessions();
    const workspaceId = projections.find((item) => item.runtime?.id === ids[0])?.organization?.workspace_id;
    if (!workspaceId) throw new Error("Session has no workspace");
    await reorderCatalogNavigation("sessions", ids.map((id) => ({ kind: "session", id })), workspaceId);
    return getCatalogDesktopState();
  }

  async function reorderCatalogPinnedSessions(ids: string[]): Promise<DesktopState> {
    await reorderCatalogNavigation("pinned", ids.map((id) => ({ kind: "session", id })));
    return getCatalogDesktopState();
  }

  function projectRepositories(project: CatalogProjectDetail): DesktopProjectRepository[] {
    const gitSources = project.sources.filter((source) => source.kind === "git");
    return gitSources.map((source) => ({
      id: source.id,
      project_id: source.project_id,
      repo_key: source.source_key,
      name: path.basename(source.canonical_path) || source.source_key,
      source_path: source.canonical_path,
      git_common_dir: source.git_common_dir ?? source.canonical_path,
      default_base_ref: "HEAD",
      availability: "available",
      created_at: source.created_at,
      updated_at: source.updated_at,
    }));
  }

  function projectFolders(project: CatalogProjectDetail): DesktopProjectFolder[] {
    return project.sources.filter((source) => source.kind === "folder").map((source) => ({
      id: source.id,
      project_id: source.project_id,
      source_key: source.source_key,
      name: path.basename(source.canonical_path) || source.source_key,
      source_path: source.canonical_path,
      default_mode: source.folder_mode ?? "reference",
      availability: "available",
      created_at: source.created_at,
      updated_at: source.updated_at,
    }));
  }

  async function pinCatalogNavigation(item: NavigationItem, pinned: boolean): Promise<DesktopState> {
    await setCatalogNavigationPinned(item, pinned);
    return getCatalogDesktopState();
  }

  async function reorderCatalogPinnedItems(items: NavigationItem[]): Promise<DesktopState> {
    await reorderCatalogNavigation("pinned", items);
    return getCatalogDesktopState();
  }

  function reconcileSelection(
    selection: ReturnType<typeof getCatalogSelection>,
    projects: DesktopProject[],
    workspaces: DesktopWorkspace[],
    conversations: DesktopConversation[],
  ): ReturnType<typeof getCatalogSelection> {
    const session = conversations.find((candidate) => candidate.id === selection.sessionId);
    if (session) return { projectId: session.project_id, workspaceId: session.workspace_id, sessionId: session.id };
    const workspace = workspaces.find((candidate) => candidate.id === selection.workspaceId);
    if (workspace) return { projectId: workspace.project_id, workspaceId: workspace.id, sessionId: null };
    const project = projects.find((candidate) => candidate.id === selection.projectId);
    return { projectId: project?.id ?? null, workspaceId: null, sessionId: null };
  }

  return {
    getCatalogDesktopState,
    createProjectInCatalog,
    renameProjectInCatalog,
    addSourcesToCatalog,
    removeSourceFromCatalog,
    createWorkspaceInCatalog,
    getWorkspaceSourcesFromCatalog,
    addWorkspaceSourceToCatalog,
    retryWorkspaceInCatalog,
    renameWorkspaceInCatalog,
    previewWorkspaceArchiveInCatalog,
    previewWorkspaceDeleteInCatalog,
    archiveWorkspaceInCatalog,
    deleteWorkspaceInCatalog,
    deleteProjectInCatalog,
    previewProjectDeleteInCatalog: previewCatalogProjectDelete,
    selectCatalogProject,
    selectCatalogWorkspace,
    selectCatalogSession,
    renameCatalogConversation,
    pinCatalogConversation,
    archiveCatalogConversation,
    reorderCatalogProjects,
    reorderCatalogWorkspaces,
    reorderCatalogWorkspaceSessions,
    reorderCatalogPinnedSessions,
    reorderCatalogPinnedItems,
    pinCatalogNavigation,
  };
}
