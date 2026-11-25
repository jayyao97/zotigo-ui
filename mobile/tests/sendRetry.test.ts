import { test } from "node:test";
import assert from "node:assert/strict";
import { failedSendState, emptyDraft, type Attempt } from "../src/core/composer";

const attempt: Attempt = { client_message_id: "m1", text: "hi", skills: [], images: [], steer: false };
const draft = { ...emptyDraft(), text: "hi" };

test("a refused send gets its draft back only if no earlier try may have arrived", () => {
  assert.deepEqual(failedSendState(draft, attempt, "rejected"), { draft });
  const uncertain = failedSendState(draft, attempt, "unknown");
  assert.equal(uncertain.attempt?.client_message_id, "m1");
  assert.equal(uncertain.attempt?.mayHaveArrived, true);
  // Retry after a timeout is refused (say, the session was archived meanwhile):
  // the first try may still be delivered, so the same ID stays for the retry.
  const retried = failedSendState(draft, uncertain.attempt!, "rejected");
  assert.equal(retried.attempt?.client_message_id, "m1");
  assert.equal(retried.attempt?.mayHaveArrived, true);
});
