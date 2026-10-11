import { stickyCatalogRows } from "../src/core/catalog";
import test from "node:test";
import assert from "node:assert/strict";
import type {
  CatalogSessionProjection,
  CatalogProject,
  CatalogWorkspace,
} from "@zotigo/shared/zotigod";
import { visibleSessions, sessionId, catalogRows } from "../src/core/catalog";
const item = (
  id: string,
  overrides: Partial<
    NonNullable<CatalogSessionProjection["organization"]>
  > = {},
): CatalogSessionProjection => ({
  runtime: null,
  availability: "offline",
  organization: {
    session_id: id,
    project_id: "p",
    workspace_id: "w",
    title: id,
    pinned_at: null,
    pinned_position: null,
    workspace_position: null,
    self_archived_at: null,
    workspace_archived_at: null,
    revision: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  },
});
test("catalog preserves unavailable sessions, excludes archives and scopes workspace", () => {
  const result = visibleSessions(
    [
      item("offline"),
      item("archived", { self_archived_at: "2026-01-02" }),
      item("workspace archived", { workspace_archived_at: "2026-01-02" }),
      item("other", { workspace_id: "other" }),
    ],
    "",
    "w",
  );
  assert.deepEqual(result.map(sessionId), ["offline"]);
});
test("pinned positions precede recency and search is case insensitive", () => {
  const input = [
    item("NEW", { updated_at: "2026-05-01" }),
    item("PIN-B", { pinned_at: "2026-01-01", pinned_position: 2 }),
    item("PIN-A", { pinned_at: "2026-01-01", pinned_position: 1 }),
  ];
  assert.deepEqual(visibleSessions(input).map(sessionId), [
    "PIN-A",
    "PIN-B",
    "NEW",
  ]);
  assert.deepEqual(visibleSessions(input, " pin- ").map(sessionId), [
    "PIN-A",
    "PIN-B",
  ]);
  assert.equal(sessionId(input[0]), "NEW");
});

const project: CatalogProject = {
  id: "p",
  name: "Mobile",
  created_at: "",
  updated_at: "",
};
const workspace: CatalogWorkspace = {
  id: "w",
  project_id: "p",
  title: "iOS",
  root_path: "/mobile",
  status: "ready",
  created_at: "",
  updated_at: "",
};
test("tree collapse hides descendants, keeps pinned shortcuts and restores nested collapse", () => {
  const sessions = [
    item("one"),
    item("pin", { pinned_at: "today" }),
    item("loose", { workspace_id: null }),
  ];
  const rows = (closed: string[]) =>
    catalogRows([project], [workspace], sessions, "", new Set(closed));
  assert.ok(rows([]).some((row) => row.key === "workspace:w:one"));
  assert.ok(
    !rows(["workspace:w"]).some((row) => row.key === "workspace:w:one"),
  );
  assert.ok(rows(["workspace:w"]).some((row) => row.key === "pinned:pin"));
  assert.ok(
    !rows(["project:p", "workspace:w"]).some(
      (row) => row.kind === "workspace",
    ),
  );
  assert.ok(rows(["workspace:w"]).some((row) => row.key === "workspace:w"));
  assert.deepEqual(
    rows([])
      .filter((row) => row.key.startsWith("recent:"))
      .map((row) => row.key),
    ["recent:loose"],
  );
  assert.equal(new Set(rows([]).map((row) => row.key)).size, rows([]).length);
});
test("search reveals matching ancestry without changing stored collapse state", () => {
  const closed = new Set(["projects", "project:p", "workspace:w"]);
  const sessions = [item("needle"), item("unrelated")];
  const result = catalogRows(
    [project],
    [workspace],
    sessions,
    "needle",
    closed,
  );
  assert.ok(result.some((row) => row.key === "project:p"));
  assert.ok(result.some((row) => row.key === "workspace:w:needle"));
  assert.ok(!result.some((row) => row.key === "workspace:w:unrelated"));
  assert.ok(
    !catalogRows([project], [workspace], sessions, "", closed).some(
      (row) => row.kind === "project",
    ),
  );
  assert.equal(
    catalogRows([project], [workspace], sessions, "iOS", closed).filter(
      (row) => row.kind === "session",
    ).length,
    2,
  );
});
test("empty and unavailable projects remain actionable while archived workspaces stay hidden", () => {
  const empty = catalogRows([project], [], [], "", new Set());
  assert.ok(empty.some((row) => row.key === "project:p:empty"));
  const failed = catalogRows([project], [], [item("one")], "", new Set(), {
    p: "Offline",
  });
  assert.ok(
    failed.some((row) => row.kind === "notice" && row.title === "Offline"),
  );
  assert.ok(failed.some((row) => row.key === "recent:one"));
  assert.ok(
    !catalogRows(
      [project],
      [{ ...workspace, status: "archived" }],
      [],
      "",
      new Set(),
    ).some((row) => row.kind === "workspace"),
  );
});

test("workspace starts with five sessions; more and search reveal the rest", () => {
  const sessions = Array.from({ length: 9 }, (_, i) => item("session-" + i));
  const rows = (expanded = new Set<string>(), query = "") =>
    catalogRows(
      [project],
      [workspace],
      sessions,
      query,
      new Set(),
      {},
      expanded,
    );
  assert.equal(rows().filter((r) => r.kind === "session").length, 5);
  assert.ok(rows().some((r) => r.kind === "more" && r.remaining === 4));
  assert.equal(
    rows(new Set(["workspace:w"])).filter((r) => r.kind === "session").length,
    9,
  );
  assert.equal(
    rows(new Set(), "session").filter((r) => r.kind === "session").length,
    9,
  );
});

test("pinned workspace is visible independently of project collapse and appears once", () => {
  const rows = catalogRows(
    [project],
    [workspace],
    [item("one")],
    "",
    new Set(["project:p", "projects"]),
    {},
    new Set(),
    [{ kind: "workspace", id: "w" }],
  );
  assert.equal(rows.filter((r) => r.kind === "workspace").length, 1);
  assert.ok(rows.some((r) => r.key === "workspace:w:one"));
  const hidden = catalogRows(
    [project],
    [workspace],
    [item("one")],
    "",
    new Set(["pinned"]),
    {},
    new Set(),
    [{ kind: "workspace", id: "w" }],
  );
  assert.ok(!hidden.some((r) => r.kind === "workspace"));
});

test("pinned workspace starts at root depth and its children have one indent", () => {
  const pinned = catalogRows(
    [project],
    [workspace],
    [item("one")],
    "",
    new Set(),
    {},
    new Set(),
    [{ kind: "workspace", id: "w" }],
  );
  assert.equal(pinned.find((r) => r.kind === "workspace")?.depth, 0);
  assert.equal(pinned.find((r) => r.kind === "session")?.depth, 1);
  const normal = catalogRows(
    [project],
    [workspace],
    [item("one")],
    "",
    new Set(),
  );
  assert.equal(normal.find((r) => r.kind === "workspace")?.depth, 1);
  assert.equal(normal.find((r) => r.kind === "session")?.depth, 2);
});

test("project and workspace stick in two rows, switch at boundaries, and skip pinned trees", () => {
  const rows = catalogRows(
    [project],
    [workspace, { ...workspace, id: "w2", title: "Second" }],
    [item("one")],
    "",
    new Set(),
  );
  const layouts = new Map(
    rows.map((r, i) => [r.key, { y: i * 44, height: 44 }]),
  );
  const projectY = layouts.get("project:p")!.y;
  assert.deepEqual(
    stickyCatalogRows(rows, layouts, projectY + 10).map((r) => [
      r.row.key,
      r.top,
    ]),
    [
      ["project:p", 0],
      ["workspace:w", 44],
    ],
  );
  const secondY = layouts.get("workspace:w2")!.y;
  assert.equal(
    stickyCatalogRows(rows, layouts, secondY - 44).at(-1)?.row.key,
    "workspace:w2",
  );
  const pinned = catalogRows(
    [project],
    [workspace],
    [item("one")],
    "",
    new Set(),
    {},
    new Set(),
    [{ kind: "workspace", id: "w" }],
  );
  const pinnedLayouts = new Map(
    pinned.map((r, i) => [r.key, { y: i * 44, height: 44 }]),
  );
  assert.deepEqual(stickyCatalogRows(pinned, pinnedLayouts, 50), []);
});

test("daemon navigation controls mixed pins and project/workspace order", () => {
  const projects = [project, { ...project, id: "p2", title: "Second" }];
  const workspaces = [workspace, { ...workspace, id: "w2", title: "Second" }];
  const order = {
    projects: [{ id: "p2" }, { id: "p" }],
    workspaces: [{ id: "w2" }, { id: "w" }],
  };
  const normal = catalogRows(
    projects,
    workspaces,
    [],
    "",
    new Set(),
    {},
    new Set(),
    [],
    order,
  );
  assert.deepEqual(
    normal.filter((r) => r.kind === "project").map((r) => r.value.id),
    ["p2", "p"],
  );
  assert.deepEqual(
    normal.filter((r) => r.kind === "workspace").map((r) => r.value.id),
    ["w2", "w"],
  );
  const pins = [
    { kind: "workspace", id: "w2" },
    { kind: "session", id: "one" },
    { kind: "workspace", id: "w" },
  ];
  const rows = catalogRows(
    projects,
    workspaces,
    [item("one", { pinned_at: "2026-01-01" })],
    "",
    new Set(),
    {},
    new Set(),
    pins,
    order,
  );
  assert.deepEqual(
    rows
      .slice(
        0,
        rows.findIndex((r) => r.key === "projects"),
      )
      .filter((r) => r.kind === "workspace" || r.kind === "session")
      .map((r) => r.key),
    ["workspace:w2", "pinned:one", "workspace:w"],
  );
});

test("workspace sessions follow daemon position before recency", () => {
  const rows = catalogRows(
    [project],
    [workspace],
    [
      item("new", { updated_at: "2026-06-01" }),
      item("second", { workspace_position: 1, updated_at: "2026-06-01" }),
      item("first", { workspace_position: 0 }),
    ],
    "",
    new Set(),
  );
  assert.deepEqual(
    rows
      .filter((row) => row.kind === "session")
      .map((row) => sessionId(row.value)),
    ["first", "second", "new"],
  );
});
