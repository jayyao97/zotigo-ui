import test from "node:test";
import assert from "node:assert/strict";
import { cachedHistory, cacheHistory } from "../src/core/historyCache";
import { DaemonClient } from "../src/core/client";
import { Timeline } from "../src/core/timeline";
import type { DisplayItem } from "@zotigo/shared/zotigod";
const client = () =>
  new DaemonClient(
    { id: "home", name: "Home", baseUrl: "https://home.test", token: "secret" },
    async () => {
      throw new Error("Unexpected network request");
    },
  );
const history = {
  items: Array.from(
    { length: 250 },
    (_, i) =>
      ({
        id: String(i + 1),
        sequence: i + 1,
        type: "assistant_message",
        created_at: "",
      }) as DisplayItem,
  ),
  session: null,
  prevCursor: null,
};
test("history cache trims inactive conversations, remembers paging boundary and hydrates immediately", () => {
  const c = client();
  cacheHistory(c, "s", history);
  const state = new Timeline(c, "s").snapshot();
  assert.equal(state.items.length, 200);
  assert.equal(state.items[0].sequence, 51);
  assert.equal(state.more, true);
  assert.equal(cachedHistory(c, "s")?.prevCursor, "51");
  assert.deepEqual(state.previews, []);
});
test("history cache is connection isolated and least-recently-used bounded", () => {
  const a = client(),
    b = client();
  for (const id of ["1", "2", "3"]) cacheHistory(a, id, history);
  assert.equal(cachedHistory(b, "1"), undefined);
  cachedHistory(a, "1");
  cacheHistory(a, "4", history);
  assert.equal(cachedHistory(a, "2"), undefined);
  assert.ok(cachedHistory(a, "1"));
  a.dispose();
  assert.equal(cachedHistory(a, "1"), undefined);
});
