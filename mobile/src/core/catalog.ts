import type { CatalogSessionProjection } from "@zotigo/shared/zotigod";
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
      const date = (item: CatalogSessionProjection) =>
        item.runtime?.updated_at ??
        item.organization?.updated_at ??
        item.runtime?.created_at ??
        "";
      return (
        date(b).localeCompare(date(a)) ||
        sessionId(a).localeCompare(sessionId(b))
      );
    });
}
