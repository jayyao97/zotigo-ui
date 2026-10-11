import test from "node:test";
import assert from "node:assert/strict";
import type { CatalogSessionProjection } from "@zotigo/shared/zotigod";
import { visibleSessions, sessionId } from "../src/core/catalog";
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
