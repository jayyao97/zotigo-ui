import test from "node:test";
import assert from "node:assert/strict";
import { visibleDisplayItems } from "../../shared/sessionDisplay";
import { requestRetryLabel } from "../../shared/requestRetry";
import type { DisplayItem } from "../../shared/zotigod";

const retry = (sequence: number, status: NonNullable<DisplayItem["retry"]>["status"], attempt = 1): DisplayItem => ({
  id: `i${sequence}`, sequence, type: "request_retry", created_at: "2026-10-25T00:00:00Z",
  retry: { request_id: "r1", status, attempt, delay_ms: 3000 },
});
test("retry status keeps one stable row and renders countdown, recovery and terminal states", () => {
  const waiting = retry(1, "waiting");
  const now = Date.parse(waiting.created_at);
  assert.match(requestRetryLabel(waiting, now), /after 3s/);
  assert.match(requestRetryLabel(waiting, now + 4000), /waiting for response/);
  const visible = visibleDisplayItems([waiting, retry(2, "retrying"), retry(3, "recovered", 2)]);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, waiting.id);
  assert.match(requestRetryLabel(visible[0], now), /after 2 retries/);
  assert.match(requestRetryLabel(retry(4, "context_recovery"), now), /context recovery/);
  assert.match(requestRetryLabel(retry(5, "canceled"), now), /stopped/);
  const failed = visibleDisplayItems([waiting, { id: "end", sequence: 6, type: "turn_failed", created_at: waiting.created_at }]);
  assert.match(requestRetryLabel(failed[0], now), /failed after 1 retry/);
  assert.equal(visibleDisplayItems([{ id: "usage", sequence: 7, type: "model_usage_updated", created_at: waiting.created_at }]).length, 0);
});
