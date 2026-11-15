import { repositoryRequestDispatcher } from "../daemonHttp";
import type { CatalogProject, CatalogProjectDetail, CatalogSessionProjection, CatalogSource, CatalogSourceInspection, CatalogWorkspace, CatalogWorkspaceSource, CatalogWorkspaceSourceInput, WorkspaceArchivePreview, WorkspaceDeletePreview, WorkspaceStatus, ProjectDeletePreview } from "../../shared/zotigod";
import type { NavigationItem, ManagedRepository, RepositoryBranch } from "../../shared/clientTypes";
import { expectRecord, expectArray, expectStringList, expectNullableString, expectNullableNumber, expectNumber, expectBoolean, expectString, expectOptionalString, expectOptionalBoolean } from "./validation";
import { ZotigodRequestError, jsonRequest, requestJSON } from "./http";
import { parseSession } from "./sessionParsers";

const catalogWorkspaceStatuses = new Set<WorkspaceStatus>([
  "provisioning", "ready", "error", "archiving", "archived", "deleting", "deleted",
]);

export async function listCatalogProjects(): Promise<CatalogProject[]> {
  const record = expectRecord(await requestJSON("/projects"), "project list response");
  return expectArray(record.projects, "project list response projects")
    .map((value, index) => parseCatalogProject(value, `project list response projects[${index}]`));
}

export async function listManagedRepositories(): Promise<ManagedRepository[]> {
  const record = expectRecord(await requestJSON("/repositories"), "repository list response");
  return expectArray(record.repositories, "repositories").map((value, index) => parseManagedRepository(value, `repositories[${index}]`));
}

export async function createManagedRepository(input: { remoteUrl: string; name?: string }): Promise<ManagedRepository> {
  return parseManagedRepository(await requestJSON("/repositories", {
    ...jsonRequest("POST", { remote_url: input.remoteUrl, name: input.name }),
    signal: AbortSignal.timeout(15000),
  }), "create repository response");
}

export async function listRepositoryBranches(projectId: string, sourceId: string, refresh = false): Promise<RepositoryBranch[]> {
  const record = expectRecord(await requestJSON(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/branches`, { method: refresh ? "POST" : "GET", signal: AbortSignal.timeout(15000) }), "repository branches response");
  return expectArray(record.branches, "branches").map((value, index) => {
    const branch = expectRecord(value, `branches[${index}]`);
    const kind = expectString(branch.kind, "branch kind");
    if (kind !== "remote" && kind !== "imported" && kind !== "local") throw new Error("Invalid repository branch kind");
    return { name: expectString(branch.name, "branch name"), ref: expectString(branch.ref, "branch ref"), kind, ...(branch.is_default === true ? { is_default: true } : {}), source_name: expectOptionalString(branch.source_name, "branch source_name") };
  });
}

function parseManagedRepository(value: unknown, context: string): ManagedRepository {
  const record = expectRecord(value, context);
  return {
    id: expectString(record.id, `${context} id`),
    name: expectString(record.name, `${context} name`),
    remote_url: expectString(record.remote_url, `${context} remote_url`),
    default_branch: expectString(record.default_branch, `${context} default_branch`),
    canonical_path: expectString(record.canonical_path, `${context} canonical_path`),
    last_synced_at: expectOptionalString(record.last_synced_at, `${context} last_synced_at`),
    last_sync_error: expectOptionalString(record.last_sync_error, `${context} last_sync_error`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

export function addCatalogRepository(projectId: string, repositoryId: string): Promise<CatalogSource> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/sources`, {
    ...jsonRequest("POST", { repository_id: repositoryId }),
    dispatcher: repositoryRequestDispatcher,
  }).then((value) => parseCatalogSource(value, "create source response"));
}

export function createCatalogProject(name: string): Promise<CatalogProject> {
  return requestJSON("/projects", jsonRequest("POST", { name }))
    .then((value) => parseCatalogProject(value, "create project response"));
}

export function renameCatalogProject(id: string, name: string): Promise<CatalogProject> {
  return requestJSON(`/projects/${encodeURIComponent(id)}`, jsonRequest("PUT", { name }))
    .then((value) => parseCatalogProject(value, "rename project response"));
}

export function getCatalogProject(id: string): Promise<CatalogProjectDetail> {
  return requestJSON(`/projects/${encodeURIComponent(id)}`)
    .then((value) => parseCatalogProjectDetail(value, "project detail response"));
}

export function inspectCatalogSource(sourcePath: string): Promise<CatalogSourceInspection> {
  return requestJSON("/sources/inspect", { ...jsonRequest("POST", { path: sourcePath }), signal: AbortSignal.timeout(10000) })
    .then((value) => parseCatalogSourceInspection(value, "source inspection response"));
}

export function addCatalogSource(projectId: string, sourcePath: string, folderMode?: string): Promise<CatalogSource> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/sources`, jsonRequest("POST", {
    path: sourcePath,
    ...(folderMode ? { folder_mode: folderMode } : {}),
  })).then((value) => parseCatalogSource(value, "create source response"));
}

export function deleteCatalogSource(projectId: string, sourceId: string): Promise<void> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" })
    .then(() => undefined);
}

export async function listCatalogWorkspaces(projectId: string): Promise<CatalogWorkspace[]> {
  const record = expectRecord(
    await requestJSON(`/projects/${encodeURIComponent(projectId)}/workspaces`),
    "workspace list response",
  );
  return expectArray(record.workspaces, "workspace list response workspaces")
    .map((value, index) => parseCatalogWorkspace(value, `workspace list response workspaces[${index}]`));
}

export function createCatalogWorkspace(
  projectId: string,
  title: string,
  sources: CatalogWorkspaceSourceInput[],
): Promise<CatalogWorkspace> {
  return requestJSON(`/projects/${encodeURIComponent(projectId)}/workspaces`, {
    ...jsonRequest("POST", { title, sources }), dispatcher: repositoryRequestDispatcher,
  })
    .then((value) => parseCatalogWorkspace(value, "create workspace response"));
}

export async function listCatalogWorkspaceSources(id: string): Promise<CatalogWorkspaceSource[]> {
  const record = expectRecord(
    await requestJSON(`/workspaces/${encodeURIComponent(id)}/sources`),
    "workspace source list response",
  );
  return expectArray(record.sources, "workspace source list response sources")
    .map((value, index) => parseCatalogWorkspaceSource(value, `workspace source list response sources[${index}]`));
}

export function addCatalogWorkspaceSource(id: string, source: CatalogWorkspaceSourceInput): Promise<CatalogWorkspaceSource> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/sources`, {
    ...jsonRequest("POST", { ...source }), dispatcher: repositoryRequestDispatcher,
  })
    .then((value) => parseCatalogWorkspaceSource(value, "add workspace source response"));
}

export function retryCatalogWorkspace(id: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/retry`, { method: "POST" })
    .then((value) => parseCatalogWorkspace(value, "retry workspace response"));
}

export function getCatalogWorkspace(id: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}`)
    .then((value) => parseCatalogWorkspace(value, "workspace detail response"));
}

export function renameCatalogWorkspace(id: string, title: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}`, jsonRequest("PUT", { title }))
    .then((value) => parseCatalogWorkspace(value, "rename workspace response"));
}

export function previewCatalogWorkspaceArchive(id: string): Promise<WorkspaceArchivePreview> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/archive-preview`)
    .then((value) => parseWorkspaceArchivePreview(value, "workspace archive preview response"));
}

export function archiveCatalogWorkspace(id: string): Promise<CatalogWorkspace> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/archive`, { method: "POST" })
    .then((value) => parseCatalogWorkspace(value, "archive workspace response"));
}

export function previewCatalogWorkspaceDelete(id: string): Promise<WorkspaceDeletePreview> {
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/delete-preview`)
    .then((value) => parseWorkspaceDeletePreview(value, "workspace delete preview response"));
}

export async function previewCatalogProjectDelete(id: string): Promise<ProjectDeletePreview> {
  const context = "project delete preview response";
  const record = expectRecord(await requestJSON(`/projects/${encodeURIComponent(id)}/delete-preview`), context);
  if (record.preserves_local_branches !== true || record.preserves_remote_refs !== true
    || record.preserves_source_directories !== true || record.preserves_runtime_sessions !== true) {
    throw new Error("Update zotigod before deleting a Project: this daemon does not guarantee preservation of Sources, session history, and Git branches.");
  }
  return {
    project_id: expectString(record.project_id, `${context} project_id`),
    workspace_ids: expectStringList(record.workspace_ids, `${context} workspace_ids`),
    workspace_roots: expectStringList(record.workspace_roots, `${context} workspace_roots`),
    dirty_worktree_paths: expectStringList(record.dirty_worktree_paths, `${context} dirty_worktree_paths`),
  };
}

export async function deleteCatalogProject(id: string, confirmation: string): Promise<void> {
  await previewCatalogProjectDelete(id);
  await requestJSON(`/projects/${encodeURIComponent(id)}/delete`, jsonRequest("POST", { confirmation }));
}

export async function deleteCatalogWorkspace(id: string, confirmation: string): Promise<void> {
  await previewCatalogWorkspaceDelete(id);
  return requestJSON(`/workspaces/${encodeURIComponent(id)}/delete`, jsonRequest("POST", { confirmation })).then(() => undefined);
}

export async function listCatalogSessions(
  options: { syncCodex?: boolean } = {},
): Promise<CatalogSessionProjection[]> {
  const path = options.syncCodex ? "/catalog/sessions?sync_codex=true" : "/catalog/sessions";
  const record = expectRecord(await requestJSON(path), "catalog session list response");
  return expectArray(record.sessions, "catalog session list response sessions")
    .map((value, index) => parseCatalogSessionProjection(value, `catalog session list response sessions[${index}]`));
}

export function parseNavigationItem(value: unknown): NavigationItem {
  const item = expectRecord(value, "navigation item");
  if (item.kind !== "project" && item.kind !== "workspace" && item.kind !== "session") throw new Error("Invalid navigation item kind");
  if (typeof item.id !== "string" || !item.id) throw new Error("Invalid navigation item id");
  return { kind: item.kind, id: item.id };
}

export async function getCatalogNavigation() {
  return parseCatalogNavigation(await requestJSON("/catalog/navigation"));
}

function parseCatalogNavigation(value: unknown) {
  const record = expectRecord(value, "navigation");
  if (typeof record.legacy_order_imported !== "boolean") throw new Error("Invalid navigation migration state");
  return {
    legacyOrderImported: record.legacy_order_imported,
    projects: expectArray(record.projects, "navigation projects").map(parseNavigationItem),
    workspaces: expectArray(record.workspaces, "navigation workspaces").map(parseNavigationItem),
    pinned: expectArray(record.pinned, "navigation pinned").map(parseNavigationItem),
  };
}

export async function getCatalogSnapshot() {
  let value: unknown;
  try { value = await requestJSON("/catalog/snapshot?sessions=none"); }
  catch (error) {
    // Older daemons keep their original catalog API. Do not mask authentication,
    // timeout or server failures by retrying through a different path.
    if (error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) return null;
    throw error;
  }
  const record = expectRecord(value, "catalog snapshot");
  return {
    sessionQueryVersion: record.session_query_version === 1 ? 1 : undefined,
    projects: expectArray(record.projects, "snapshot projects").map((item, i) => parseCatalogProjectDetail(item, `snapshot projects[${i}]`)),
    workspaces: expectArray(record.workspaces, "snapshot workspaces").map((item, i) => parseCatalogWorkspace(item, `snapshot workspaces[${i}]`)),
    navigation: parseCatalogNavigation(record.navigation),
    sessions: expectArray(record.sessions, "snapshot sessions").map((item, i) => parseCatalogSessionProjection(item, `snapshot sessions[${i}]`)),
  };
}

export async function reorderCatalogNavigation(scope: "projects" | "workspaces" | "sessions" | "pinned", items: NavigationItem[], parentId?: string): Promise<void> {
  await requestJSON("/catalog/navigation/order", jsonRequest("PUT", { scope, parent_id: parentId, items }));
}

export async function importCatalogNavigation(orders: { scope: string; parent_id?: string; items: NavigationItem[] }[]): Promise<void> {
  await requestJSON("/catalog/navigation/import", jsonRequest("POST", { orders }));
}

export async function setCatalogNavigationPinned(item: NavigationItem, pinned: boolean): Promise<void> {
  await requestJSON("/catalog/navigation/pin", jsonRequest("PUT", { item, pinned }));
}

export function setCatalogSessionTitle(id: string, title: string): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "title", "PUT", { title });
}

export function setCatalogSessionPinned(id: string, pinned: boolean): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "pinned", "PUT", { pinned });
}

export function setCatalogSessionPosition(id: string, position: number): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "position", "PUT", { position });
}

export function archiveCatalogSession(id: string): Promise<CatalogSessionProjection> {
  return sessionOrganizationRequest(id, "archive", "POST");
}

function sessionOrganizationRequest(
  id: string,
  action: string,
  method: "POST" | "PUT",
  payload?: Record<string, unknown>,
): Promise<CatalogSessionProjection> {
  const init = payload ? jsonRequest(method, payload) : { method };
  return requestJSON(`/sessions/${encodeURIComponent(id)}/${action}`, init)
    .then((value) => parseCatalogSessionProjection(value, `session ${action} response`));
}

function parseCatalogProject(value: unknown, context: string): CatalogProject {
  const record = expectRecord(value, context);
  return {
    id: expectString(record.id, `${context} id`),
    name: expectString(record.name, `${context} name`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseCatalogProjectDetail(value: unknown, context: string): CatalogProjectDetail {
  const project = parseCatalogProject(value, context);
  const record = expectRecord(value, context);
  return {
    ...project,
    sources: expectArray(record.sources, `${context} sources`)
      .map((source, index) => parseCatalogSource(source, `${context} sources[${index}]`)),
  };
}

function parseCatalogSource(value: unknown, context: string): CatalogSource {
  const record = expectRecord(value, context);
  const kind = expectString(record.kind, `${context} kind`);
  if (kind !== "git" && kind !== "folder") throw new Error(`${context} kind is not supported: ${kind}`);
  const folderMode = expectOptionalString(record.folder_mode, `${context} folder_mode`);
  if (folderMode !== undefined && folderMode !== "direct" && folderMode !== "reference" && folderMode !== "copy") {
    throw new Error(`${context} folder_mode is not supported: ${folderMode}`);
  }
  return {
    id: expectString(record.id, `${context} id`),
    project_id: expectString(record.project_id, `${context} project_id`),
    kind,
    canonical_path: expectString(record.canonical_path, `${context} canonical_path`),
    git_common_dir: expectOptionalString(record.git_common_dir, `${context} git_common_dir`),
    git_object_format: expectOptionalString(record.git_object_format, `${context} git_object_format`),
    folder_mode: folderMode,
    repository_id: expectOptionalString(record.repository_id, `${context} repository_id`),
    remote_url: expectOptionalString(record.remote_url, `${context} remote_url`),
    default_branch: expectOptionalString(record.default_branch, `${context} default_branch`),
    last_synced_at: expectOptionalString(record.last_synced_at, `${context} last_synced_at`),
    last_sync_error: expectOptionalString(record.last_sync_error, `${context} last_sync_error`),
    source_key: expectString(record.source_key, `${context} source_key`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseCatalogSourceInspection(value: unknown, context: string): CatalogSourceInspection {
  const record = expectRecord(value, context);
  const kind = expectString(record.kind, `${context} kind`);
  if (kind !== "git" && kind !== "folder") throw new Error(`${context} kind is not supported: ${kind}`);
  return {
    kind,
    canonical_path: expectString(record.canonical_path, `${context} canonical_path`),
    git_common_dir: expectOptionalString(record.git_common_dir, `${context} git_common_dir`),
    git_object_format: expectOptionalString(record.git_object_format, `${context} git_object_format`),
    source_key: expectString(record.source_key, `${context} source_key`),
  };
}

function parseCatalogWorkspace(value: unknown, context: string): CatalogWorkspace {
  const record = expectRecord(value, context);
  const status = expectString(record.status, `${context} status`);
  if (!catalogWorkspaceStatuses.has(status as WorkspaceStatus)) throw new Error(`${context} status is not supported: ${status}`);
  return {
    id: expectString(record.id, `${context} id`),
    project_id: expectString(record.project_id, `${context} project_id`),
    title: expectString(record.title, `${context} title`),
    root_path: expectString(record.root_path, `${context} root_path`),
    status: status as WorkspaceStatus,
    error: expectOptionalString(record.error, `${context} error`),
    archived_at: expectOptionalString(record.archived_at, `${context} archived_at`),
    deleted_at: expectOptionalString(record.deleted_at, `${context} deleted_at`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseCatalogWorkspaceSource(value: unknown, context: string): CatalogWorkspaceSource {
  const record = expectRecord(value, context);
  const mode = expectOptionalString(record.mode, `${context} mode`);
  if (mode !== undefined && mode !== "direct" && mode !== "reference" && mode !== "copy") {
    throw new Error(`${context} mode is not supported: ${mode}`);
  }
  return {
    source: parseCatalogSource(record.source, `${context} source`),
    repository_id: expectOptionalString(record.repository_id, `${context} repository_id`),
    mode,
    target_path: expectString(record.target_path, `${context} target_path`),
    base_ref: expectOptionalString(record.base_ref, `${context} base_ref`),
    base_commit: expectOptionalString(record.base_commit, `${context} base_commit`),
    branch_name: expectOptionalString(record.branch_name, `${context} branch_name`),
    worktree_path: expectOptionalString(record.worktree_path, `${context} worktree_path`),
    used_cached_base: expectOptionalBoolean(record.used_cached_base, `${context} used_cached_base`),
    base_synced_at: expectOptionalString(record.base_synced_at, `${context} base_synced_at`),
    status: expectString(record.status, `${context} status`),
    error: expectOptionalString(record.error, `${context} error`),
  };
}

function parseCatalogSessionProjection(value: unknown, context: string): CatalogSessionProjection {
  const record = expectRecord(value, context);
  const organizationValue = record.organization;
  return {
    runtime: record.runtime === null || record.runtime === undefined ? null : parseSession(record.runtime, `${context} runtime`),
    organization: organizationValue === null || organizationValue === undefined
      ? null
      : parseCatalogSessionOrganization(organizationValue, `${context} organization`),
    availability: expectString(record.availability, `${context} availability`),
  };
}

function parseCatalogSessionOrganization(value: unknown, context: string): CatalogSessionProjection["organization"] {
  const record = expectRecord(value, context);
  return {
    session_id: expectString(record.session_id, `${context} session_id`),
    project_id: expectNullableString(record.project_id, `${context} project_id`),
    workspace_id: expectNullableString(record.workspace_id, `${context} workspace_id`),
    title: expectNullableString(record.title, `${context} title`),
    pinned_at: expectNullableString(record.pinned_at, `${context} pinned_at`),
    pinned_position: expectNullableNumber(record.pinned_position, `${context} pinned_position`),
    workspace_position: expectNullableNumber(record.workspace_position, `${context} workspace_position`),
    self_archived_at: expectNullableString(record.self_archived_at, `${context} self_archived_at`),
    workspace_archived_at: expectNullableString(record.workspace_archived_at, `${context} workspace_archived_at`),
    revision: expectNumber(record.revision, `${context} revision`),
    created_at: expectString(record.created_at, `${context} created_at`),
    updated_at: expectString(record.updated_at, `${context} updated_at`),
  };
}

function parseWorkspaceArchivePreview(value: unknown, context: string): WorkspaceArchivePreview {
  const record = expectRecord(value, context);
  return {
    workspace_id: expectString(record.workspace_id, `${context} workspace_id`),
    workspace_title: "",
    root_path: "",
    worktree_paths: expectStringList(record.worktree_paths, `${context} worktree_paths`),
    dirty_worktree_paths: expectStringList(record.dirty_worktree_paths, `${context} dirty_worktree_paths`),
  };
}

function parseWorkspaceDeletePreview(value: unknown, context: string): WorkspaceDeletePreview {
  const record = expectRecord(value, context);
  if (record.preserves_local_branches !== true) {
    throw new Error("Update zotigod before deleting a Workspace: this daemon does not guarantee preservation of local Git branches.");
  }
  const archive = parseWorkspaceArchivePreview(value, context);
  return {
    ...archive,
    root_path: expectString(record.workspace_root, `${context} workspace_root`),
    session_ids: expectStringList(record.session_ids, `${context} session_ids`),
    local_branches: expectStringList(record.local_branches, `${context} local_branches`),
    preserves_sources: expectBoolean(record.preserves_sources, `${context} preserves_sources`),
    preserves_runtime_sessions: expectBoolean(record.preserves_runtime_sessions, `${context} preserves_runtime_sessions`),
    preserves_remote_refs: expectBoolean(record.preserves_remote_refs, `${context} preserves_remote_refs`),
    preserves_local_branches: true,
  };
}

export async function queryCatalogSessions(input: import("../../shared/clientTypes").SessionQuery) {
  const params = new URLSearchParams({page: "true", limit: String(input.limit ?? 50)});
  for (const [key, value] of Object.entries({workspace_id: input.workspaceId, project_id: input.projectId, ungrouped: input.ungrouped, pinned: input.pinned, unread: input.unread, since: input.since, channel: input.channel, q: input.query, cursor: input.cursor, ids: input.ids?.join(","), sync_codex: input.syncCodex})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const record = expectRecord(await requestJSON(`/catalog/sessions?${params}`), "session page");
  if (record.query_version !== 1) throw new Error("Daemon does not support paginated session queries");
  return { sessions: expectArray(record.sessions, "session page sessions").map((value, index) => parseCatalogSessionProjection(value, `session page ${index}`)), nextCursor: typeof record.next_cursor === "string" ? record.next_cursor : undefined };
}
export async function getCatalogSession(id: string): Promise<CatalogSessionProjection> {
  return parseCatalogSessionProjection(await requestJSON(`/catalog/sessions/${encodeURIComponent(id)}`), "catalog session");
}
