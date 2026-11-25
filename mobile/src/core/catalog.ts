import { workspaceSourceMatches } from "@zotigo/shared/workspaceSourceSelection";
import { t } from "@zotigo/shared/i18n/index";
import { orderSidebarItems } from "@zotigo/shared/sidebarOrdering";
import type {
  CatalogProject,
  CatalogWorkspace,
  CatalogSessionProjection,
  CatalogSource,
} from "@zotigo/shared/zotigod";
import { sessionActivity } from "./relativeTime";

/** Sessions shown under a workspace or in Recent before "Show more". */
export const WORKSPACE_PREVIEW = 5;
export const RECENT_PREVIEW = 6;
export function sessionId(item: CatalogSessionProjection): string {
  return item.organization?.session_id ?? item.runtime?.id ?? "";
}
export function sessionTitle(item: CatalogSessionProjection): string {
  return item.organization?.title || sessionId(item);
}
export function visibleSessions(
  items: CatalogSessionProjection[],
  query = "",
  workspaceId?: string,
): CatalogSessionProjection[] {
  const search = query.trim().toLocaleLowerCase();
  return items
    .filter(
      (item) =>
        sessionId(item) &&
        !item.organization?.self_archived_at &&
        !item.organization?.workspace_archived_at &&
        (!workspaceId || item.organization?.workspace_id === workspaceId) &&
        (!search ||
          `${sessionTitle(item)} ${item.runtime?.working_directory ?? ""}`
            .toLocaleLowerCase()
            .includes(search)),
    )
    .sort((a, b) => {
      const ap = a.organization?.pinned_at;
      const bp = b.organization?.pinned_at;
      if (!!ap !== !!bp) return ap ? -1 : 1;
      if (ap && bp) {
        const d =
          (a.organization?.pinned_position ?? 0) -
          (b.organization?.pinned_position ?? 0);
        if (d) return d;
      }
      const position =
        (a.organization?.workspace_position ?? Number.MAX_SAFE_INTEGER) -
        (b.organization?.workspace_position ?? Number.MAX_SAFE_INTEGER);
      if (position) return position;
      return byRecency(a, b);
    });
}

function byRecency(a: CatalogSessionProjection, b: CatalogSessionProjection) {
  return (
    sessionActivity(b).localeCompare(sessionActivity(a)) ||
    sessionId(a).localeCompare(sessionId(b))
  );
}

/** Compact display only; requests always retain the original daemon path. */
export function pathLabel(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}

export type CatalogRow =
  | { kind: "heading"; key: string; title: string; open: boolean }
  | { kind: "project"; key: string; value: CatalogProject; open: boolean }
  | {
      kind: "workspace";
      key: string;
      value: CatalogWorkspace;
      open: boolean;
      depth: number;
    }
  | {
      kind: "session";
      key: string;
      value: CatalogSessionProjection;
      depth: number;
      /** Where the session lives; only set where the tree does not already show it. */
      context?: string;
    }
  | {
      kind: "more";
      key: string;
      /** Key in the `expanded` set: a workspace key or "recent". */
      group: string;
      expanded: boolean;
      remaining: number;
      depth: number;
    }
  | { kind: "notice"; key: string; title: string; depth?: number };

/** Flatten expanded branches so even long workspace histories remain virtualized. */
export function catalogRows(
  projects: CatalogProject[],
  workspaces: CatalogWorkspace[],
  items: CatalogSessionProjection[],
  query: string,
  collapsed: ReadonlySet<string>,
  workspaceErrors: Record<string, string> = {},
  expanded: ReadonlySet<string> = new Set(),
  pins: readonly { kind: string; id: string }[] = [],
  order: { projects: { id: string }[]; workspaces: { id: string }[] } = {
    projects: [],
    workspaces: [],
  },
): CatalogRow[] {
  projects = orderSidebarItems(
    projects,
    order.projects.map((p) => p.id),
  );
  workspaces = orderSidebarItems(
    workspaces,
    order.workspaces.map((w) => w.id),
  );
  const rows: CatalogRow[] = [];
  const search = query.trim().toLocaleLowerCase();
  const matches = (title: string) =>
    title.toLocaleLowerCase().includes(search);
  const open = (key: string) => !!search || !collapsed.has(key);
  const sessions = visibleSessions(items);
  const matchingSessions = new Set(
    visibleSessions(items, query).map(sessionId),
  );
  const addSessions = (
    values: CatalogSessionProjection[],
    scope: string,
    nested: boolean,
  ) => {
    for (const value of values)
      rows.push({
        kind: "session",
        key: `${scope}:${sessionId(value)}`,
        value,
        depth: nested ? 2 : 0,
      });
  };
  const pinned = sessions.filter(
    (item) =>
      (item.organization?.pinned_at ||
        pins.some((p) => p.kind === "session" && p.id === sessionId(item))) &&
      matchingSessions.has(sessionId(item)),
  );
  if (
    pinned.length ||
    pins.some(p => p.kind === "project" && projects.some(project => project.id === p.id)) ||
    pins.some(
      (p) =>
        p.kind === "workspace" &&
        workspaces.some(
          (w) =>
            w.id === p.id &&
            !w.archived_at &&
            !w.deleted_at &&
            w.status !== "archived" &&
            w.status !== "deleted",
        ),
    )
  ) {
    rows.push({
      kind: "heading",
      key: "pinned",
      title: t("app.pinned"),
      open: open("pinned"),
    });
  }
  const activeWorkspaces = workspaces.filter(
    (w) =>
      !w.archived_at &&
      !w.deleted_at &&
      w.status !== "deleted" &&
      w.status !== "archived",
  );
  const pinnedSessionIds = new Set(pinned.map(sessionId));
  const workspaceRows = (
    workspace: CatalogWorkspace,
    projectMatches: boolean,
    depth = 1,
  ): CatalogRow[] => {
    const result: CatalogRow[] = [];
    const workspaceKey = `workspace:${workspace.id}`;
    result.push({
      kind: "workspace",
      key: workspaceKey,
      value: workspace,
      depth,
      open: open(workspaceKey),
    });
    if (!open(workspaceKey)) return result;
    const children = sessions.filter(
      (s) =>
        s.organization?.workspace_id === workspace.id &&
        !pinnedSessionIds.has(sessionId(s)) &&
        (!search ||
          projectMatches ||
          matches(workspace.title) ||
          matchingSessions.has(sessionId(s))),
    );
    const shown =
      search || expanded.has(workspaceKey)
        ? children
        : children.slice(0, WORKSPACE_PREVIEW);
    for (const value of shown)
      result.push({
        kind: "session",
        key: `${workspaceKey}:${sessionId(value)}`,
        value,
        depth: depth + 1,
      });
    if (!search && children.length > WORKSPACE_PREVIEW)
      result.push({
        kind: "more",
        key: workspaceKey + ":more",
        group: workspaceKey,
        expanded: expanded.has(workspaceKey),
        remaining: children.length - WORKSPACE_PREVIEW,
        depth: depth + 1,
      });
    // Empty workspaces show no placeholder row; the row's compose button is the call to action.
    return result;
  };
  const pinnedWorkspaceIds = new Set(
    pins.filter((p) => p.kind === "workspace").map((p) => p.id),
  );
  const projectBranch = (project: CatalogProject): CatalogRow[] => {
    const projectRows: CatalogRow[] = [];
    const projectMatches = matches(project.name);
    const children = activeWorkspaces.filter(
      (w) => w.project_id === project.id,
    );
    const matchingChildren = children.filter(
      (w) =>
        projectMatches ||
        matches(w.title) ||
        sessions.some(
          (s) =>
            s.organization?.workspace_id === w.id &&
            matchingSessions.has(sessionId(s)),
        ),
    );
    if (search && !projectMatches && !matchingChildren.length) return [];
    const key = `project:${project.id}`;
    projectRows.push({
      kind: "project",
      key,
      value: project,
      open: open(key),
    });
    if (!open(key)) return projectRows;
    if (workspaceErrors[project.id])
      projectRows.push({
        kind: "notice",
        key: `${key}:error`,
        title: workspaceErrors[project.id],
      });
    else if (!children.length)
      projectRows.push({
        kind: "notice",
        key: `${key}:empty`,
        title: t("mobile.noWorkspacesYet"),
      });
    for (const workspace of matchingChildren) {
      if (!pinnedWorkspaceIds.has(workspace.id))
        projectRows.push(...workspaceRows(workspace, projectMatches));
    }
    return projectRows;
  };
  if (open("pinned"))
    for (const pin of [
      ...pins,
      ...pinned
        .filter(
          (s) =>
            !pins.some((p) => p.kind === "session" && p.id === sessionId(s)),
        )
        .map((s) => ({ kind: "session", id: sessionId(s) })),
    ]) {
      if (pin.kind === "project") {
        const project = projects.find(project => project.id === pin.id);
        if (project) rows.push(...projectBranch(project));
        continue;
      }
      if (pin.kind === "session") {
        const session = pinned.find((s) => sessionId(s) === pin.id);
        if (session) addSessions([session], "pinned", false);
        continue;
      }
      const workspace = activeWorkspaces.find(
        (w) => pin.kind === "workspace" && w.id === pin.id,
      );
      if (
        workspace &&
        (!search ||
          matches(workspace.title) ||
          sessions.some(
            (s) =>
              s.organization?.workspace_id === workspace.id &&
              matchingSessions.has(sessionId(s)),
          ))
      )
        rows.push(...workspaceRows(workspace, false, 0));
    }
  const assigned = new Set(
    activeWorkspaces
      .filter((w) => projects.some((p) => p.id === w.project_id))
      .map((w) => w.id),
  );
  // Recent comes before the tree: continuing a conversation should not need
  // the user to remember which project and workspace it lives in. While
  // searching, the tree already reveals matches, so only list what it cannot.
  const recent = sessions
    .filter(
      (s) =>
        !pinnedSessionIds.has(sessionId(s)) &&
        matchingSessions.has(sessionId(s)) &&
        (!search || !assigned.has(s.organization?.workspace_id ?? "")),
    )
    .sort(byRecency);
  if (recent.length) {
    rows.push({
      kind: "heading",
      key: "recent",
      title: t("mobileUi.recent"),
      open: open("recent"),
    });
    if (open("recent")) {
      const all = !!search || expanded.has("recent");
      for (const value of all ? recent : recent.slice(0, RECENT_PREVIEW)) {
        const workspace = activeWorkspaces.find(
          (w) => w.id === value.organization?.workspace_id,
        );
        const project = projects.find((p) => p.id === workspace?.project_id);
        rows.push({
          kind: "session",
          key: `recent:${sessionId(value)}`,
          value,
          depth: 0,
          context: project && workspace ? `${project.name} · ${workspace.title}` : undefined,
        });
      }
      if (!search && recent.length > RECENT_PREVIEW)
        rows.push({
          kind: "more",
          key: "recent:more",
          group: "recent",
          expanded: expanded.has("recent"),
          remaining: recent.length - RECENT_PREVIEW,
          depth: 0,
        });
    }
  }
  const projectRows = projects
    .filter((project) => !pins.some((pin) => pin.kind === "project" && pin.id === project.id))
    .flatMap(projectBranch);
  // The heading carries "New project", so it stays even with nothing under it.
  // Nothing at all returns no rows so Home can show its empty state instead.
  if (projectRows.length || (!search && rows.length)) {
    rows.push({
      kind: "heading",
      key: "projects",
      title: t("app.projects"),
      open: open("projects"),
    });
    if (open("projects")) {
      rows.push(...projectRows);
      if (!projectRows.length)
        rows.push({
          kind: "notice",
          key: "projects:empty",
          title: projects.length ? t("mobileUi.allProjectsPinned") : t("app.noProjectsYet"),
          depth: 0,
        });
    }
  }
  return rows;
}

// Match the React sidebar: section → project → workspace; directly pinned
// workspaces have no project ancestor. Siblings push each sticky row out.
export type CatalogLayout = { y: number; height: number };
export function stickyCatalogRows(
  rows: CatalogRow[],
  layouts: ReadonlyMap<string, CatalogLayout>,
  offset: number,
): { row: CatalogRow; top: number }[] {
  const level = (row: CatalogRow): number => row.kind === "heading" ? 0
    : row.kind === "project" ? 1
    : row.kind === "workspace" ? row.depth + 1
    : row.kind === "notice" ? (row.depth ?? 1) + 1 : row.depth + 1;
  const result: { row: CatalogRow; top: number }[] = [];
  let start = 0;
  let end = rows.length;
  let top = 0;
  for (let depth = 0; depth < 3; depth++) {
    let candidate = -1;
    for (let i = start; i < end; i++) {
      const layout = layouts.get(rows[i].key);
      if (level(rows[i]) === depth && layout && layout.y <= offset + top) candidate = i;
    }
    if (candidate < 0) break;
    const row = rows[candidate];
    if (row.kind !== "heading" && row.kind !== "project" && row.kind !== "workspace") break;
    let boundary = candidate + 1;
    while (boundary < end && level(rows[boundary]) > depth) boundary++;
    const bottom = boundary < rows.length ? layouts.get(rows[boundary].key)?.y ?? Infinity : Infinity;
    const layout = layouts.get(row.key)!;
    if (bottom <= offset + top) break;
    result.push({ row, top: Math.min(top, bottom - offset - layout.height) });
    top += layout.height;
    start = candidate + 1;
    end = boundary;
  }
  return result;
}

/**
 * Project sources a search keeps, matching name, local path or remote URL like
 * Desktop's source picker. Sources already chosen stay listed so a search
 * never hides what will be added.
 */
export function filterSources<T extends CatalogSource>(
  sources: T[],
  query: string,
  chosen: (source: T) => boolean = () => false,
): T[] {
  return sources.filter(
    (source) =>
      chosen(source) ||
      workspaceSourceMatches(
        { name: pathLabel(source.canonical_path), source_path: source.canonical_path, remote_url: source.remote_url },
        query,
      ),
  );
}
