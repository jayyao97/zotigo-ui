export type UsageChannelFilter = "all" | "only" | "exclude";

/** Dates are inclusive calendar days in timeZone (an IANA name). */
export interface UsageQuery {
  timeZone: string;
  from: string;
  to: string;
  model?: string;
  channel?: UsageChannelFilter;
}

export interface UsageSessionsQuery extends UsageQuery {
  cursor?: string;
  limit?: number;
}

/**
 * cacheInput is the full input of models that reported any cache read, the
 * denominator of the cache hit rate; zero means the rate is unavailable.
 */
export interface UsageTotals {
  total: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  cacheInput: number;
  turns: number;
}

export interface UsageDay extends UsageTotals { date: string }
export interface UsageModel extends UsageTotals { model: string; runtime: string }

export interface UsageActivity {
  trackingSince: string | null;
  range: UsageTotals;
  allTime: UsageTotals;
  byModel: UsageModel[];
  days: UsageDay[];
  peakDay: { date: string; total: number } | null;
  currentStreakDays: number;
  longestStreakDays: number;
}

// "unavailable" covers sessions whose workspace or runtime cannot open now.
export type UsageSessionAvailability = "available" | "archived" | "unavailable" | "deleted";

export interface UsageSession extends UsageTotals {
  sessionId: string;
  models: string[];
  channelTurns: number;
  lastCompletedAt: string;
  title: string;
  availability: UsageSessionAvailability;
}

export interface UsageSessionPage {
  sessions: UsageSession[];
  nextCursor?: string;
}

/** Older daemons have no usage endpoints. */
export type UsageResult<T> = { supported: true; data: T } | { supported: false };

export function cacheHitRate(totals: Pick<UsageTotals, "cacheRead" | "cacheInput">): number | null {
  return totals.cacheInput > 0 ? totals.cacheRead / totals.cacheInput : null;
}

export function parseUsageQuery(value: unknown): UsageQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid usage query");
  const record = value as Record<string, unknown>;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof record.timeZone !== "string" || !record.timeZone.trim()) throw new Error("Invalid usage time zone");
  if (typeof record.from !== "string" || !date.test(record.from) || typeof record.to !== "string" || !date.test(record.to)) throw new Error("Invalid usage date range");
  if (record.model !== undefined && record.model !== null && typeof record.model !== "string") throw new Error("Invalid usage model");
  if (record.channel !== undefined && record.channel !== null && record.channel !== "all" && record.channel !== "only" && record.channel !== "exclude") throw new Error("Invalid usage channel filter");
  return {
    timeZone: record.timeZone, from: record.from, to: record.to,
    ...(typeof record.model === "string" && record.model ? { model: record.model } : {}),
    ...(typeof record.channel === "string" ? { channel: record.channel as UsageChannelFilter } : {}),
  };
}

export function parseUsageSessionsQuery(value: unknown): UsageSessionsQuery {
  const query: UsageSessionsQuery = parseUsageQuery(value);
  const record = value as Record<string, unknown>;
  if (record.cursor !== undefined && record.cursor !== null) {
    if (typeof record.cursor !== "string") throw new Error("Invalid usage cursor");
    if (record.cursor) query.cursor = record.cursor;
  }
  if (record.limit !== undefined && record.limit !== null) {
    if (typeof record.limit !== "number" || !Number.isInteger(record.limit) || record.limit < 1 || record.limit > 200) throw new Error("Invalid usage limit");
    query.limit = record.limit;
  }
  return query;
}
