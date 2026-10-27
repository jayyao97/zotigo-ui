import assert from "node:assert/strict";
import test from "node:test";
import { messageTimestamp } from "../src/conversation/messageTimestamp";

test("message times distinguish recent weekdays from old dates and reject missing dates", () => {
  const now = new Date("2026-10-15T18:00:00Z");
  assert.equal(messageTimestamp(undefined), null);
  assert.equal(messageTimestamp("not a date"), null);
  const recent = messageTimestamp("2026-10-15T10:12:00Z", now, "en-US")!;
  assert.match(recent.label, /Thu/);
  assert.match(recent.full, /2026/);
  const old = messageTimestamp("2025-10-15T10:12:00Z", now, "en-US")!;
  assert.match(old.label, /2025/);
});


test("last week's same weekday shows the date even before 168 hours have elapsed", () => {
  const now = new Date(2026, 9, 26, 15, 33);
  const lastMonday = new Date(2026, 9, 19, 22, 1);
  const sixDaysAgo = new Date(2026, 9, 20, 9, 0);
  for (const locale of ["en-US", "zh-CN"]) {
    const old = messageTimestamp(lastMonday.toISOString(), now, locale)!;
    assert.equal(old.label, lastMonday.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
    assert.doesNotMatch(old.label, /2026|Mon|周一/);
    assert.equal(messageTimestamp(sixDaysAgo.toISOString(), now, locale)!.label,
      sixDaysAgo.toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }));
    assert.match(old.full, /2026/);
  }
});

test("calendar threshold holds across daylight saving changes", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const now = new Date(2026, 2, 9, 0, 30);
    const old = new Date(2026, 2, 2, 23, 30);
    assert.ok(now.getTime() - old.getTime() < 7 * 24 * 60 * 60 * 1000);
    assert.equal(messageTimestamp(old.toISOString(), now, "en-US")!.label,
      old.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
