import type {
  UsageActivity,
  UsageModel,
  UsageQuery,
  UsageResult,
  UsageSession,
  UsageSessionAvailability,
  UsageSessionPage,
  UsageSessionsQuery,
  UsageTotals,
} from "@zotigo/shared/usage";
import type { CatalogSessionProjection } from "@zotigo/shared/zotigod";
import { ApiError, record, type DaemonClient } from "./client";

// Mobile talks to the daemon directly, so it parses the same public responses
// that backend/daemon/usage.ts parses for Desktop and resolves session titles
// the way backend/usageService.ts does.

type Request = DaemonClient["request"];

export async function usageActivity(request: Request, query: UsageQuery): Promise<UsageResult<UsageActivity>> {
  const value = await usageRequest(request, "/usage/activity", params(query));
  if (value === undefined) return { supported: false };
  const peak = value.peak_day;
  return {
    supported: true,
    data: {
      trackingSince: value.tracking_since === null || value.tracking_since === undefined ? null : text(value.tracking_since, "tracking_since"),
      range: totals(value.range, "range"),
      allTime: totals(value.all_time, "all_time"),
      byModel: list(value.by_model, "by_model").map((item, index): UsageModel => {
        const model = record(item);
        return { ...totals(model, `by_model[${index}]`), model: text(model.model, "model"), runtime: text(model.runtime, "runtime") };
      }),
      days: list(value.days, "days").map((item, index) => {
        const day = record(item);
        return { ...totals(day, `days[${index}]`), date: text(day.date, "date") };
      }),
      peakDay: peak === null || peak === undefined ? null : { date: text(record(peak).date, "peak date"), total: number(record(peak).total, "peak total") },
      currentStreakDays: number(value.current_streak_days, "current_streak_days"),
      longestStreakDays: number(value.longest_streak_days, "longest_streak_days"),
    },
  };
}

/** Ranked sessions carry only IDs; titles and availability come from the catalog. */
export async function usageSessions(request: Request, query: UsageSessionsQuery): Promise<UsageResult<UsageSessionPage>> {
  const search = params(query);
  search.set("limit", String(query.limit ?? 50));
  if (query.cursor) search.set("cursor", query.cursor);
  const value = await usageRequest(request, "/usage/sessions", search);
  if (value === undefined) return { supported: false };
  const rows = list(value.sessions, "sessions").map((item, index) => {
    const session = record(item);
    return {
      ...totals(session, `sessions[${index}]`),
      sessionId: text(session.session_id, "session_id"),
      models: list(session.models, "models").map((model) => text(model, "model")),
      channelTurns: number(session.channel_turns, "channel_turns"),
      lastCompletedAt: text(session.last_completed_at, "last_completed_at"),
    };
  });
  const catalog = new Map<string, Pick<UsageSession, "title" | "availability">>();
  if (rows.length) {
    const page = record(await request(`/catalog/sessions?${new URLSearchParams({
      page: "true",
      limit: String(rows.length),
      ids: rows.map((row) => row.sessionId).join(","),
      include_archived: "true",
    })}`));
    if (page.query_version !== 1) throw new Error("Daemon does not support paginated session queries");
    for (const projection of list(page.sessions, "catalog sessions") as CatalogSessionProjection[]) {
      const id = projection.runtime?.id ?? projection.organization?.session_id;
      if (id) catalog.set(id, { title: projection.organization?.title?.trim() || promptTitle(projection.runtime?.last_prompt), availability: availability(projection) });
    }
  }
  const nextCursor = typeof value.next_cursor === "string" && value.next_cursor ? value.next_cursor : undefined;
  return {
    supported: true,
    data: {
      // Usage outlives sessions; an ID unknown to the catalog was deleted.
      sessions: rows.map((row) => ({ ...row, ...(catalog.get(row.sessionId) ?? { title: "", availability: "deleted" as const }) })),
      ...(nextCursor ? { nextCursor } : {}),
    },
  };
}

function availability(projection: CatalogSessionProjection): UsageSessionAvailability {
  if (projection.availability === "ready") return "available";
  if (projection.availability === "archived") return "archived";
  return projection.runtime ? "unavailable" : "deleted";
}

// Untitled sessions are labelled by their latest prompt, as on Desktop.
function promptTitle(prompt: string | undefined): string {
  const value = (prompt ?? "").replace(/\s+/g, " ").trim();
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

function params(query: UsageQuery): URLSearchParams {
  const search = new URLSearchParams({ tz: query.timeZone, from: query.from, to: query.to });
  if (query.model) search.set("model", query.model);
  if (query.channel && query.channel !== "all") search.set("channel", query.channel);
  return search;
}

/** Older daemons have no usage endpoints or an older query version. */
async function usageRequest(request: Request, path: string, search: URLSearchParams): Promise<Record<string, unknown> | undefined> {
  try {
    const value = record(await request(`${path}?${search}`, "GET", undefined, undefined, 20000));
    return value.usage_query_version === 1 ? value : undefined;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return undefined;
    throw error;
  }
}

function totals(value: unknown, context: string): UsageTotals {
  const item = record(value);
  return {
    total: number(item.total, `${context} total`),
    input: number(item.input, `${context} input`),
    cacheRead: number(item.cache_read, `${context} cache_read`),
    cacheWrite: number(item.cache_write, `${context} cache_write`),
    output: number(item.output, `${context} output`),
    cacheInput: number(item.cache_input, `${context} cache_input`),
    turns: number(item.turns, `${context} turns`),
  };
}
function list(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid usage response: ${context}`);
  return value;
}
function number(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid usage response: ${context}`);
  return value;
}
function text(value: unknown, context: string): string {
  if (typeof value !== "string") throw new Error(`Invalid usage response: ${context}`);
  return value;
}
