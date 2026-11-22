import type { Locale } from "./i18n/index";
import type { UsageDay, UsageTotals } from "./usage";

/** Calendar dates are YYYY-MM-DD strings; arithmetic runs on UTC midnights. */
export function parseDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
export function formatDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
export function addDays(date: string, days: number): string {
  return formatDate(parseDate(date) + days * 86_400_000);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / 86_400_000);
}
export function todayIn(timeZone: string, now = new Date()): string {
  // Read the parts rather than relying on a locale's date pattern: Hermes on
  // iOS formats through the platform, which may not spell en-CA as YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Chinese weeks start on Monday, English weeks on Sunday. */
export function weekStartDay(locale: Locale): 0 | 1 {
  return locale === "zh-CN" ? 1 : 0;
}
export function startOfWeek(date: string, weekStart: 0 | 1): string {
  const weekday = new Date(parseDate(date)).getUTCDay();
  return addDays(date, -((weekday - weekStart + 7) % 7));
}

export const heatmapWeeks = 53;

/** The heatmap ends with the week containing today and spans 53 weeks. */
export function heatmapRange(today: string, weekStart: 0 | 1): { from: string; to: string } {
  return { from: addDays(startOfWeek(today, weekStart), -(heatmapWeeks - 1) * 7), to: today };
}

export const emptyTotals = (): UsageTotals => ({ total: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cacheInput: 0, turns: 0 });

export function addTotals(target: UsageTotals, value: UsageTotals): UsageTotals {
  target.total += value.total; target.input += value.input; target.cacheRead += value.cacheRead;
  target.cacheWrite += value.cacheWrite; target.output += value.output; target.cacheInput += value.cacheInput; target.turns += value.turns;
  return target;
}

export interface HeatmapCell extends UsageTotals { date: string; future: boolean; column: number; row: number }
export interface HeatmapWeek extends UsageTotals { start: string; end: string; column: number }

/** Fills every date of the heatmap, including days without usage. */
export function heatmapCells(days: UsageDay[], range: { from: string; to: string }): HeatmapCell[] {
  const byDate = new Map(days.map(day => [day.date, day]));
  const cells: HeatmapCell[] = [];
  for (let index = 0; index < heatmapWeeks * 7; index++) {
    const date = addDays(range.from, index);
    const day = byDate.get(date);
    cells.push({ ...emptyTotals(), ...(day ?? {}), date, future: date > range.to, column: Math.floor(index / 7), row: index % 7 });
  }
  return cells;
}

export function heatmapWeekTotals(cells: HeatmapCell[]): HeatmapWeek[] {
  const weeks: HeatmapWeek[] = [];
  for (const cell of cells) {
    let week = weeks[cell.column];
    if (!week) week = weeks[cell.column] = { ...emptyTotals(), start: cell.date, end: cell.date, column: cell.column };
    if (!cell.future) { addTotals(week, cell); week.end = cell.date; }
  }
  return weeks;
}

/** Running totals over every past day of the range. */
export function cumulativeTotals(cells: HeatmapCell[]): Array<{ date: string; total: number }> {
  let total = 0;
  return cells.filter(cell => !cell.future).map(cell => ({ date: cell.date, total: total += cell.total }));
}

/**
 * Level 0 is no usage; 1–4 scale with the square root of the share of the
 * busiest value, so one heavy day does not flatten every other day.
 */
export function intensityLevels(values: number[]): (value: number) => 0 | 1 | 2 | 3 | 4 {
  const maximum = Math.max(0, ...values);
  return value => value <= 0 || maximum <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(4 * Math.sqrt(value / maximum)))) as 1 | 2 | 3 | 4;
}

/** Month labels at each month's first column, skipping ones too close to the next. */
export function monthColumns(cells: Array<{ date: string; column: number; row: number }>, minimumGap = 3): Array<{ column: number; date: string }> {
  const starts = cells.filter(cell => cell.row === 0 && (cell.column === 0 || addDays(cell.date, -7).slice(0, 7) !== cell.date.slice(0, 7)));
  return starts.filter((cell, index) => (starts[index + 1]?.column ?? heatmapWeeks + minimumGap) - cell.column >= minimumGap);
}

/** Token counts use 万/亿 in Chinese and K/M/B in English. */
export function formatTokens(value: number, locale: Locale): string {
  const units: Array<[number, string]> = locale === "zh-CN"
    ? [[1e12, "万亿"], [1e8, "亿"], [1e4, "万"]]
    : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (Math.abs(value) >= size) {
      const scaled = value / size;
      const digits = Math.abs(scaled) >= 100 ? 0 : 1;
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(scaled)}${suffix}`;
    }
  }
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function formatDayLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" }).format(parseDate(date));
}

export function formatLongDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(parseDate(date));
}

export function formatMonth(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short" }).format(parseDate(date));
}

/**
 * Zones offered when the runtime cannot list its own. Hermes (mobile) has no
 * Intl.supportedValuesOf; one zone per common offset keeps the picker useful.
 */
const fallbackTimeZones = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Halifax", "America/Sao_Paulo", "Atlantic/Azores", "Europe/London", "Europe/Paris", "Europe/Berlin", "Africa/Cairo",
  "Europe/Moscow", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Australia/Adelaide",
  "Australia/Sydney", "Pacific/Auckland",
];

/** Time zones offered by the runtime, with the system zone always present. */
export function availableTimeZones(): string[] {
  const system = systemTimeZone();
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch { zones = []; }
  if (!zones.length) zones = fallbackTimeZones;
  return zones.includes(system) ? zones : [system, ...zones];
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * Intl also accepts lowercase names and offsets such as "+08:00" that the
 * daemon's IANA database rejects, so a name must also be spelled like an IANA
 * name. The suggestion list is not authoritative: ICU lists legacy spellings
 * such as Asia/Katmandu but not every current one.
 */
export function isValidTimeZone(value: string): boolean {
  if (value !== "UTC" && !/^[A-Z][A-Za-z_-]*(\/[A-Z][A-Za-z0-9_+-]*)+$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

/** Minutes east of UTC for a zone at the given instant. */
export function timeZoneOffsetMinutes(timeZone: string, at = new Date()): number {
  // Compare the zone's wall clock with UTC instead of reading a
  // "longOffset" name, which Hermes on iOS does not provide.
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    }).formatToParts(at);
  } catch { return 0; }
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"));
  const instant = Math.floor(at.getTime() / 60_000) * 60_000;
  const offset = Math.round((wall - instant) / 60_000);
  return Number.isFinite(offset) ? offset : 0;
}

/** "UTC", "UTC+8", "UTC+5:45", "UTC-3:30". */
export function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const absolute = Math.abs(minutes);
  const rest = absolute % 60;
  return `UTC${minutes < 0 ? "-" : "+"}${Math.floor(absolute / 60)}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** The last segment of an IANA name as a place: "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function timeZoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

export interface TimeZoneOption {
  id: string;
  city: string;
  /** Localized generic name, such as 中国标准时间 or Pacific Time. */
  name: string;
  offset: number;
  offsetLabel: string;
}

export function timeZoneOption(id: string, locale: Locale, at = new Date()): TimeZoneOption {
  let name = "";
  try {
    name = new Intl.DateTimeFormat(locale, { timeZone: id, timeZoneName: "longGeneric" }).formatToParts(at).find(part => part.type === "timeZoneName")?.value ?? "";
  } catch { name = ""; }
  const offset = timeZoneOffsetMinutes(id, at);
  // Zones without a localized name fall back to an offset such as GMT+08:00; that adds nothing.
  if (/^(GMT|UTC)([+-]|$)/.test(name)) name = "";
  return { id, city: timeZoneCity(id), name, offset, offsetLabel: formatUtcOffset(offset) };
}

// Every zone the daemon can accept. ICU does not list UTC itself, only
// cities that happen to be at UTC+0 now.
function timeZoneIds(): string[] {
  return ["UTC", ...availableTimeZones().filter(id => id !== "UTC" && isValidTimeZone(id))];
}

/** UTC first, then west to east, then by name. */
function sortTimeZoneOptions(options: TimeZoneOption[]): TimeZoneOption[] {
  return options.sort((left, right) => Number(right.id === "UTC") - Number(left.id === "UTC") || left.offset - right.offset || left.id.localeCompare(right.id));
}

const optionLoads = new Map<string, Promise<TimeZoneOption[]>>();

/**
 * Builds the options without blocking: each zone needs two Intl formatters
 * (about 0.35 ms each), ~150 ms for the whole list, so it is built in slices
 * that yield between them. Results are shared per locale and hour, since
 * daylight saving changes offsets.
 */
export function loadTimeZoneOptions(locale: Locale, at = new Date()): Promise<TimeZoneOption[]> {
  const key = `${locale}|${Math.floor(at.getTime() / 3_600_000)}`;
  let load = optionLoads.get(key);
  if (!load) {
    optionLoads.clear();
    load = (async () => {
      const options: TimeZoneOption[] = [];
      const ids = timeZoneIds();
      for (let index = 0; index < ids.length; index += 40) {
        if (index) await new Promise(resolve => setTimeout(resolve, 0));
        for (const id of ids.slice(index, index + 40)) options.push(timeZoneOption(id, locale, at));
      }
      return sortTimeZoneOptions(options);
    })();
    optionLoads.set(key, load);
  }
  return load;
}

/**
 * Matches the IANA name (with spaces for underscores), the localized name, or
 * an offset written as +8, UTC+8, GMT-3:30 or +0545.
 */
export function matchesTimeZone(option: TimeZoneOption, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const offset = /^(?:utc|gmt)?\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (offset) return option.offset === (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] ?? 0));
  if (text === "utc" || text === "gmt") return option.offset === 0;
  const haystack = `${option.id} ${option.id.replaceAll("_", " ")} ${option.name}`.toLowerCase();
  return text.split(/\s+/).every(word => haystack.includes(word));
}
