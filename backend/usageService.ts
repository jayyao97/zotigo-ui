import type { UsageResult, UsageSession, UsageSessionAvailability, UsageSessionPage, UsageSessionsQuery } from "../shared/usage";
import { promptTitle } from "./catalogService";
import { getUsageSessionRows, queryCatalogSessions } from "./zotigod";

function availability(projection: import("../shared/zotigod").CatalogSessionProjection): UsageSessionAvailability {
  if (projection.availability === "ready") return "available";
  if (projection.availability === "archived") return "archived";
  return projection.runtime ? "unavailable" : "deleted";
}

// Usage outlives sessions; an ID unknown to the catalog was deleted.
export async function getUsageSessions(query: UsageSessionsQuery): Promise<UsageResult<UsageSessionPage>> {
  const result = await getUsageSessionRows(query);
  if (!result.supported) return result;
  const { sessions: rows, nextCursor } = result.data;
  const catalog = new Map<string, Pick<UsageSession, "title" | "availability">>();
  if (rows.length) {
    const page = await queryCatalogSessions({ ids: rows.map(row => row.sessionId), limit: rows.length }, { includeArchived: true });
    for (const projection of page.sessions) {
      const id = projection.runtime?.id ?? projection.organization?.session_id;
      if (id) catalog.set(id, { title: projection.organization?.title?.trim() || promptTitle(projection.runtime?.last_prompt), availability: availability(projection) });
    }
  }
  return { supported: true, data: {
    sessions: rows.map(row => ({ ...row, ...(catalog.get(row.sessionId) ?? { title: "", availability: "deleted" as const }) })),
    ...(nextCursor ? { nextCursor } : {}),
  } };
}
