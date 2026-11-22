import assert from "node:assert/strict";
import test from "node:test";

import { cacheHitRate } from "../shared/usage";
import { addDays, formatUtcOffset, loadTimeZoneOptions, isValidTimeZone, matchesTimeZone, timeZoneOffsetMinutes, timeZoneOption, cumulativeTotals, formatPercent, formatTokens, heatmapCells, heatmapRange, heatmapWeekTotals, intensityLevels, monthColumns, startOfWeek, todayIn, weekStartDay } from "../src/usage/usageModel";

const day = (date: string, total: number, cacheRead = 0, cacheInput = 0) => ({ date, total, input: total, cacheRead, cacheWrite: 0, output: 0, cacheInput, turns: 1 });

test("weeks start on Monday in Chinese and Sunday in English", () => {
  // 2026-11-21 is a Saturday.
  assert.equal(startOfWeek("2026-11-21", weekStartDay("zh-CN")), "2026-11-16");
  assert.equal(startOfWeek("2026-11-21", weekStartDay("en")), "2026-11-15");
  assert.equal(startOfWeek("2026-11-16", 1), "2026-11-16");
  const range = heatmapRange("2026-11-21", 1);
  assert.equal(range.from, addDays("2026-11-16", -52 * 7));
  assert.equal(range.to, "2026-11-21");
});

test("the heatmap fills empty days and marks the rest of this week as future", () => {
  const range = heatmapRange("2026-11-21", 1);
  const cells = heatmapCells([day("2026-11-20", 7)], range);
  assert.equal(cells.length, 53 * 7);
  assert.equal(cells[0].date, range.from);
  assert.equal(cells.find(cell => cell.date === "2026-11-19")?.total, 0);
  assert.equal(cells.find(cell => cell.date === "2026-11-20")?.total, 7);
  assert.deepEqual(cells.filter(cell => cell.future).map(cell => cell.date), ["2026-11-22"]);
  const last = cells.at(-1)!;
  assert.equal(last.column, 52);
  assert.equal(last.row, 6);
});

test("weekly totals and cumulative totals are computed from days", () => {
  const range = heatmapRange("2026-11-21", 1);
  const cells = heatmapCells([day("2026-11-09", 5, 4, 5), day("2026-11-16", 10, 0, 0), day("2026-11-20", 20, 10, 20)], range);
  const weeks = heatmapWeekTotals(cells);
  assert.equal(weeks.length, 53);
  assert.equal(weeks[52].total, 30);
  assert.equal(weeks[52].end, "2026-11-21");
  // Hit rate is token-weighted after summing the week; a day without cache input adds nothing.
  assert.equal(cacheHitRate(weeks[52]), 0.5);
  assert.equal(cacheHitRate(weeks[51]), 0.8);
  assert.equal(cacheHitRate(weeks[50]), null);
  const cumulative = cumulativeTotals(cells);
  assert.equal(cumulative.at(-1)?.total, 35);
  assert.equal(cumulative.at(-1)?.date, "2026-11-21");
});

test("intensity levels scale with the busiest value", () => {
  const level = intensityLevels([0, 1, 30, 100]);
  assert.equal(level(0), 0);
  assert.equal(level(1), 1);
  assert.equal(level(30), 3);
  assert.equal(level(100), 4);
  // A single active day is at full intensity, not the palest level.
  assert.equal(intensityLevels([0, 7])(7), 4);
});

test("month labels skip a partial leading month", () => {
  const cells = heatmapCells([], heatmapRange("2026-11-21", 1));
  const months = monthColumns(cells);
  // The first column starts in November 2025 but December begins one column later.
  assert.equal(months[0].date.slice(0, 7), "2025-12");
  assert.ok(months.every((month, index) => index === 0 || month.column - months[index - 1].column >= 3));
});

test("token counts use 万/亿 in Chinese and K/M/B in English", () => {
  assert.equal(formatTokens(9_999, "zh-CN"), "9,999");
  assert.equal(formatTokens(12_345, "zh-CN"), "1.2万");
  assert.equal(formatTokens(123_456_789, "zh-CN"), "1.2亿");
  assert.equal(formatTokens(5_100_000_000, "zh-CN"), "51亿");
  assert.equal(formatTokens(999, "en"), "999");
  assert.equal(formatTokens(1_500, "en"), "1.5K");
  assert.equal(formatTokens(250_000_000, "en"), "250M");
  assert.equal(formatTokens(5_100_000_000, "en"), "5.1B");
  assert.equal(formatPercent(0.856), "86%");
  assert.equal(formatPercent(null), "—");
});

test("today follows the chosen time zone", () => {
  const instant = new Date("2026-11-20T23:30:00Z");
  assert.equal(todayIn("UTC", instant), "2026-11-20");
  assert.equal(todayIn("Asia/Shanghai", instant), "2026-11-21");
  assert.equal(todayIn("America/Los_Angeles", instant), "2026-11-20");
});

test("time zones must be IANA names the daemon also accepts", () => {
  for (const zone of ["UTC", "Asia/Shanghai", "Asia/Kathmandu", "America/Argentina/Buenos_Aires", "Etc/GMT+1"]) assert.ok(isValidTimeZone(zone), zone);
  for (const zone of ["asia/shanghai", "+08:00", "Local", "Mars/Base", ""]) assert.equal(isValidTimeZone(zone), false, zone);
});

test("time zone options carry UTC offsets and match names or offsets", () => {
  const winter = new Date("2026-01-15T00:00:00Z");
  const summer = new Date("2026-07-15T00:00:00Z");
  assert.equal(timeZoneOffsetMinutes("Asia/Shanghai", winter), 480);
  assert.equal(timeZoneOffsetMinutes("America/New_York", winter), -300);
  assert.equal(timeZoneOffsetMinutes("America/New_York", summer), -240);
  assert.equal(timeZoneOffsetMinutes("UTC", winter), 0);
  assert.deepEqual([0, 480, 345, -210].map(formatUtcOffset), ["UTC", "UTC+8", "UTC+5:45", "UTC-3:30"]);

  const kathmandu = timeZoneOption("Asia/Kathmandu", "en", winter);
  assert.equal(kathmandu.offsetLabel, "UTC+5:45");
  for (const query of ["", "kathmandu", "Asia/Kath", "+5:45", "UTC+5:45", "+0545", "nepal"]) assert.ok(matchesTimeZone(kathmandu, query), query);
  for (const query of ["+8", "shanghai", "-5:45"]) assert.equal(matchesTimeZone(kathmandu, query), false, query);
  const angeles = timeZoneOption("America/Los_Angeles", "en", winter);
  assert.equal(angeles.city, "Los Angeles");
  assert.ok(matchesTimeZone(angeles, "los angeles"));
  assert.ok(matchesTimeZone(angeles, "pacific"));
  assert.ok(matchesTimeZone(angeles, "-8"));
  assert.ok(matchesTimeZone(timeZoneOption("Europe/London", "en", winter), "utc"));
});

test("the time zone list always offers UTC first and is shared per locale", async () => {
  const at = new Date("2026-01-15T00:00:00Z");
  const load = loadTimeZoneOptions("zh-CN", at);
  assert.equal(loadTimeZoneOptions("zh-CN", at), load, "one build per locale and hour");
  const options = await load;
  assert.equal(options[0].id, "UTC");
  assert.equal(options.filter(option => option.id === "UTC").length, 1);
  assert.ok(options.some(option => option.id === "Asia/Shanghai" && option.offset === 480));
  const rest = options.slice(1);
  assert.ok(rest.every((option, index) => index === 0 || rest[index - 1].offset <= option.offset), "west to east");
});
