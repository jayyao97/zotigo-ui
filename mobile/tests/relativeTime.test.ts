import test from "node:test";
import assert from "node:assert/strict";
import { getLocale, setLocale } from "../../shared/i18n/index";
import { compactAge, sessionActivity } from "../src/core/relativeTime";
import type { CatalogSessionProjection } from "@zotigo/shared/zotigod";

test("compact age buckets into now, minutes, hours, days and then a date", () => {
  const previous = getLocale();
  try {
    setLocale("en");
    const now = Date.parse("2026-11-16T12:00:00Z");
    const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
    assert.equal(compactAge(ago(10), now), "now");
    assert.equal(compactAge(ago(5 * 60), now), "5m");
    assert.equal(compactAge(ago(3 * 3600), now), "3h");
    assert.equal(compactAge(ago(2 * 86400), now), "2d");
    assert.notEqual(compactAge(ago(30 * 86400), now, "en-US"), "");
    assert.equal(compactAge("not a date", now), "");
    // Clock skew never produces a negative age.
    assert.equal(compactAge(ago(-120), now), "now");
    setLocale("zh-CN");
    assert.equal(compactAge(ago(3 * 3600), now), "3小时");
  } finally {
    setLocale(previous);
  }
});

test("session activity is the latest runtime or organization timestamp", () => {
  const item = {
    availability: "offline",
    runtime: { updated_at: "2026-11-10T00:00:00Z", created_at: "2026-11-01T00:00:00Z" },
    organization: { updated_at: "2026-11-12T00:00:00Z" },
  } as unknown as CatalogSessionProjection;
  assert.equal(sessionActivity(item), "2026-11-12T00:00:00Z");
  assert.equal(sessionActivity({ availability: "x", runtime: null, organization: null }), "");
});
