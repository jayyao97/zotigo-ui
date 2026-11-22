import type { UsageActivity, UsageModel, UsageQuery, UsageResult, UsageSession, UsageSessionsQuery, UsageTotals } from "../../shared/usage";
import { ZotigodRequestError, requestJSON } from "./http";
import { expectArray, expectNumber, expectRecord, expectString, expectStringList } from "./validation";

export async function getUsageActivity(query: UsageQuery): Promise<UsageResult<UsageActivity>> {
  const value = await requestUsage("/usage/activity", usageParams(query));
  if (value === undefined) return { supported: false };
  const record = expectRecord(value, "usage activity");
  const peak = record.peak_day;
  return { supported: true, data: {
    trackingSince: record.tracking_since === null || record.tracking_since === undefined ? null : expectString(record.tracking_since, "usage tracking_since"),
    range: parseTotals(record.range, "usage range"),
    allTime: parseTotals(record.all_time, "usage all_time"),
    byModel: expectArray(record.by_model, "usage by_model").map((item, index): UsageModel => {
      const model = expectRecord(item, `usage by_model[${index}]`);
      return { ...parseTotals(model, `usage by_model[${index}]`), model: expectString(model.model, "usage model"), runtime: expectString(model.runtime, "usage runtime") };
    }),
    days: expectArray(record.days, "usage days").map((item, index) => {
      const day = expectRecord(item, `usage days[${index}]`);
      return { ...parseTotals(day, `usage days[${index}]`), date: expectString(day.date, "usage day date") };
    }),
    peakDay: peak === null || peak === undefined ? null : (() => {
      const day = expectRecord(peak, "usage peak_day");
      return { date: expectString(day.date, "usage peak date"), total: expectNumber(day.total, "usage peak total") };
    })(),
    currentStreakDays: expectNumber(record.current_streak_days, "usage current_streak_days"),
    longestStreakDays: expectNumber(record.longest_streak_days, "usage longest_streak_days"),
  } };
}

export type UsageSessionRow = Omit<UsageSession, "title" | "availability">;

/** Ranked sessions carry only IDs; callers resolve titles from the catalog. */
export async function getUsageSessionRows(query: UsageSessionsQuery): Promise<UsageResult<{ sessions: UsageSessionRow[]; nextCursor?: string }>> {
  const params = usageParams(query);
  params.set("limit", String(query.limit ?? 50));
  if (query.cursor) params.set("cursor", query.cursor);
  const value = await requestUsage("/usage/sessions", params);
  if (value === undefined) return { supported: false };
  const record = expectRecord(value, "usage sessions");
  const sessions = expectArray(record.sessions, "usage sessions").map((item, index): UsageSessionRow => {
    const session = expectRecord(item, `usage sessions[${index}]`);
    return {
      ...parseTotals(session, `usage sessions[${index}]`),
      sessionId: expectString(session.session_id, "usage session_id"),
      models: expectStringList(session.models, "usage session models"),
      channelTurns: expectNumber(session.channel_turns, "usage session channel_turns"),
      lastCompletedAt: expectString(session.last_completed_at, "usage session last_completed_at"),
    };
  });
  const nextCursor = typeof record.next_cursor === "string" && record.next_cursor ? record.next_cursor : undefined;
  return { supported: true, data: { sessions, ...(nextCursor ? { nextCursor } : {}) } };
}

function usageParams(query: UsageQuery): URLSearchParams {
  const params = new URLSearchParams({ tz: query.timeZone, from: query.from, to: query.to });
  if (query.model) params.set("model", query.model);
  if (query.channel && query.channel !== "all") params.set("channel", query.channel);
  return params;
}

async function requestUsage(path: string, params: URLSearchParams): Promise<unknown> {
  try {
    const value = expectRecord(await requestJSON(`${path}?${params}`, { signal: AbortSignal.timeout(20000) }), "usage response");
    if (value.usage_query_version !== 1) return undefined;
    return value;
  } catch (error) {
    if (error instanceof ZotigodRequestError && (error.status === 404 || error.status === 405)) return undefined;
    throw error;
  }
}

function parseTotals(value: unknown, context: string): UsageTotals {
  const record = expectRecord(value, context);
  return {
    total: expectNumber(record.total, `${context} total`),
    input: expectNumber(record.input, `${context} input`),
    cacheRead: expectNumber(record.cache_read, `${context} cache_read`),
    cacheWrite: expectNumber(record.cache_write, `${context} cache_write`),
    output: expectNumber(record.output, `${context} output`),
    cacheInput: expectNumber(record.cache_input, `${context} cache_input`),
    turns: expectNumber(record.turns, `${context} turns`),
  };
}
