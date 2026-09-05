import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogRefreshDue,
  catalogSnapshotIsCurrent,
  scheduledCatalogSyncDue,
} from "../shared/catalogRefreshPolicy";

test("throttles catalog retries from the last attempt, including failed attempts", () => {
  const input = {
    syncRequested: false,
    desktopStateLoaded: true,
    nowMs: 35_000,
    lastAttemptAtMs: 10_000,
    intervalMs: 30_000,
  };
  assert.equal(catalogRefreshDue(input), false);
  assert.equal(catalogRefreshDue({ ...input, nowMs: 40_000 }), true);
  assert.equal(catalogRefreshDue({ ...input, syncRequested: true }), true);
});

test("rejects a catalog snapshot after a newer desktop mutation", () => {
  assert.equal(catalogSnapshotIsCurrent(4, 4), true);
  assert.equal(catalogSnapshotIsCurrent(4, 5), false);
});

test("schedules Codex sync from the last attempt so failures do not retry every poll", () => {
  const input = {
    desktopStateLoaded: true,
    nowMs: 320_000,
    notBeforeMs: 15_000,
    lastAttemptAtMs: 25_000,
    intervalMs: 300_000,
  };
  assert.equal(scheduledCatalogSyncDue(input), false);
  assert.equal(scheduledCatalogSyncDue({ ...input, nowMs: 325_000 }), true);
  assert.equal(scheduledCatalogSyncDue({ ...input, desktopStateLoaded: false }), false);
});
