import { orderSidebarItems } from "@zotigo/shared/sidebarOrdering";
import type {
  CatalogProject,
  CatalogWorkspace,
  CatalogSessionProjection,
} from "@zotigo/shared/zotigod";
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
      const date = (item: CatalogSessionProjection) =>
        [
          item.runtime?.updated_at,
          item.organization?.updated_at,
          item.runtime?.created_at,
        ]
          .filter((value): value is string => !!value)
          .sort()
          .at(-1) ?? "";
      return (
        date(b).localeCompare(date(a)) ||
        sessionId(a).localeCompare(sessionId(b))
      );
    });
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
    }
  | {
      kind: "more";
      key: string;
      workspaceKey: string;
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
      title: "Pinned",
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
      search || expanded.has(workspaceKey) ? children : children.slice(0, 5);
    for (const value of shown)
      result.push({
        kind: "session",
        key: `${workspaceKey}:${sessionId(value)}`,
        value,
        depth: depth + 1,
      });
    if (!search && children.length > 5)
      result.push({
        kind: "more",
        key: workspaceKey + ":more",
        workspaceKey,
        expanded: expanded.has(workspaceKey),
        remaining: children.length - 5,
        depth: depth + 1,
      });
    if (!children.length)
      result.push({
        kind: "notice",
        key: `${workspaceKey}:empty`,
        title: "No conversations yet",
        depth: depth + 1,
      });
    return result;
  };
  const pinnedWorkspaceIds = new Set(
    pins.filter((p) => p.kind === "workspace").map((p) => p.id),
  );
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
  const projectRows: CatalogRow[] = [];
  for (const project of projects) {
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
    if (search && !projectMatches && !matchingChildren.length) continue;
    const key = `project:${project.id}`;
    projectRows.push({
      kind: "project",
      key,
      value: project,
      open: open(key),
    });
    if (!open(key)) continue;
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
        title: "No workspaces yet",
      });
    for (const workspace of matchingChildren) {
      if (!pinnedWorkspaceIds.has(workspace.id))
        projectRows.push(...workspaceRows(workspace, projectMatches));
    }
  }
  if (projectRows.length) {
    rows.push({
      kind: "heading",
      key: "projects",
      title: "Projects",
      open: open("projects"),
    });
    if (open("projects")) rows.push(...projectRows);
  }
  const assigned = new Set(
    activeWorkspaces
      .filter((w) => projects.some((p) => p.id === w.project_id))
      .map((w) => w.id),
  );
  const recent = sessions.filter(
    (s) =>
      !pinnedSessionIds.has(sessionId(s)) &&
      !assigned.has(s.organization?.workspace_id ?? "") &&
      matchingSessions.has(sessionId(s)),
  );
  if (recent.length) {
    rows.push({
      kind: "heading",
      key: "recent",
      title: "Recent",
      open: open("recent"),
    });
    if (open("recent")) addSessions(recent, "recent", false);
  }
  return rows;
}

// Pinned branches flow normally. Project trees keep their two ancestor rows visible.
export type CatalogLayout = { y: number; height: number };
export function stickyCatalogRows(
  rows: CatalogRow[],
  layouts: ReadonlyMap<string, CatalogLayout>,
  offset: number,
): { row: CatalogRow; top: number }[] {
  let project = -1;
  for (let i = 0; i < rows.length; i++) {
    const layout = layouts.get(rows[i].key);
    if (
      layout &&
      layout.y <= offset &&
      (rows[i].kind === "project" || rows[i].kind === "heading")
    )
      project = rows[i].kind === "project" ? i : -1;
  }
  if (project < 0) return [];
  const header = layouts.get(rows[project].key)!;
  const boundary = rows.findIndex(
    (r, i) => i > project && (r.kind === "project" || r.kind === "heading"),
  );
  const end =
    boundary < 0
      ? Infinity
      : (layouts.get(rows[boundary].key)?.y ?? Infinity);
  if (end <= offset) return [];
  const result = [
    { row: rows[project], top: Math.min(0, end - offset - header.height) },
  ];
  let workspace = -1;
  for (
    let i = project + 1;
    i < (boundary < 0 ? rows.length : boundary);
    i++
  ) {
    const row = rows[i],
      layout = layouts.get(row.key);
    if (
      row.kind === "workspace" &&
      row.depth > 0 &&
      layout &&
      layout.y <= offset + header.height
    )
      workspace = i;
  }
  if (workspace >= 0) {
    const layout = layouts.get(rows[workspace].key)!;
    const next = rows.findIndex(
      (r, i) =>
        i > workspace &&
        (r.kind === "workspace" ||
          r.kind === "project" ||
          r.kind === "heading"),
    );
    const bottom =
      next < 0 ? Infinity : (layouts.get(rows[next].key)?.y ?? Infinity);
    if (bottom > offset + header.height)
      result.push({
        row: rows[workspace],
        top: Math.min(header.height, bottom - offset - layout.height),
      });
  }
  return result;
}
