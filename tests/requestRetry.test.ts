import assert from "node:assert/strict";
import test from "node:test";
import { visibleDisplayItems } from "../shared/sessionDisplay";
import type { DisplayItem } from "../shared/zotigod";
import { setLocale, t } from "../shared/i18n";

function retry(sequence: number, request_id: string, status: NonNullable<DisplayItem["retry"]>["status"], attempt = 1): DisplayItem {
  return { id: `item-${sequence}`, sequence, type: "request_retry", created_at: new Date(sequence * 1000).toISOString(), retry: { request_id, status, attempt, delay_ms: 1000 } };
}

test("retry updates replace one stable row, including failures and recovery", () => {
  const items = [retry(1, "request-a", "waiting"), retry(2, "request-a", "retrying"), retry(3, "request-a", "waiting", 2), retry(4, "request-a", "recovered", 2)];
  for (let end = 1; end <= items.length; end++) {
    const visible = visibleDisplayItems(items.slice(0, end));
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, "item-1");
    assert.deepEqual(visible[0].retry, items[end - 1].retry);
  }
  assert.equal(items[0].retry?.status, "waiting", "projection must not mutate cached history");
  const second = retry(5, "request-b", "failed", 2);
  assert.equal(visibleDisplayItems([...items, second]).length, 2, "separate model requests must not merge");
  assert.equal(visibleDisplayItems(items.slice(2))[0].retry?.status, "recovered", "pagination can start mid-retry");
});

test("usage updates and steering do not split a retry group", () => {
  const items: DisplayItem[] = [retry(1, "a", "waiting"), { id: "usage", sequence: 2, type: "model_usage_updated", created_at: "now" }, { id: "input", sequence: 3, type: "steering_message", created_at: "now" }, retry(4, "a", "canceled")];
  const visible = visibleDisplayItems(items);
  assert.deepEqual(visible.map(item => item.id), ["item-1", "input"]);
  assert.equal(visible[0].retry?.status, "canceled");
});

test("an interrupted worker cannot leave a historical retry looking active", () => {
  const terminal: DisplayItem = { id: "stop", sequence: 2, type: "turn_interrupted", created_at: "now" };
  const visible = visibleDisplayItems([retry(1, "a", "waiting"), terminal]);
  assert.equal(visible[0].retry?.status, "canceled");
});

test("context recovery is a terminal handoff, not a successful request retry", () => {
  for (const type of ["turn_completed", "turn_failed", "turn_interrupted"] as const) {
    const terminal: DisplayItem = { id: "end", sequence: 3, type, created_at: "now" };
    const visible = visibleDisplayItems([retry(1, "a", "waiting"), retry(2, "a", "context_recovery"), terminal]);
    assert.equal(visible[0].retry?.status, "context_recovery");
  }
});

test("English retry labels use singular and plural forms", () => {
  setLocale("en");
  for (const key of ["retry.recovered", "retry.failed"] as const) {
    assert.match(t(key, { attempt: 1, count: 1 }), /after 1 retry$/);
    assert.match(t(key, { attempt: 2, count: 2 }), /after 2 retries$/);
  }
});
