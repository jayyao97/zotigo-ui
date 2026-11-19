import assert from "node:assert/strict";
import test from "node:test";
import { readSessionHistoryTail } from "../src/sessionHistoryTail";
import type { DisplayItem, SessionItemsResponse } from "../shared/zotigod";

function page(sequences: number[], next = "", prev = ""): SessionItemsResponse {
  const items = sequences.map(sequence => ({ sequence, id: String(sequence), type: "assistant_message", created_at: "" }) as DisplayItem);
  return { items, next_cursor: next, prev_cursor: prev, has_more: Boolean(next || prev) };
}

test("an interrupted recovery resumes from its last complete page, including sparse public sequences", async () => {
  const all = Array.from({length: 350}, (_, i) => (i + 1) * 2); // intermediate internal records are hidden
  const cached = all.slice(0, 10);
  let failOnce = true;
  const recover = () => readSessionHistoryTail(cached.at(-1), async ({after, limit}) => {
    assert.ok(after && limit);
    const missing = all.filter(sequence => sequence > after);
    if (missing.length < 200 && failOnce) { failOnce = false; throw Error("offline"); }
    const batch = missing.slice(0,limit);
    return page(batch, missing.length > limit ? String(batch.at(-1)) : "", String(batch[0]));
  }, () => true, batch => cached.push(...batch.items.map(item => item.sequence)));
  await assert.rejects(recover, /offline/);
  assert.equal(cached.length,210);
  await recover();
  assert.deepEqual(cached,all);
});

test("empty known history recovers all prior pages; a new cold selection starts at the latest page", async () => {
  const latest = page([202,203], "", "202");
  const first = page([1,201], "201", "");
  for (const checkpoint of [0, undefined]) {
    const received: number[] = [];
    await readSessionHistoryTail(checkpoint, async query => query.before === 202 ? first : latest,
      () => true, page => received.push(...page.items.map(item => item.sequence)));
    assert.deepEqual(received, checkpoint === 0 ? [1,201,202,203] : [202,203]);
  }
});

test("a superseded page cannot advance the cursor", async () => {
  let current = true;
  const applied: number[] = [];
  await readSessionHistoryTail(1, async () => { current = false; return page([2]); }, () => current,
    page => applied.push(...page.items.map(item => item.sequence)));
  assert.deepEqual(applied,[]);
});
