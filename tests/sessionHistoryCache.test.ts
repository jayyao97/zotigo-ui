import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionHistoryCache } from "../src/sessionHistoryCache";
import type { DisplayItem } from "../shared/zotigod";

const item = (sequence: number, type: DisplayItem["type"] = "assistant_message", text = "hello"): DisplayItem => ({ id: String(sequence), sequence, type, content: [{ type: "text", text }], created_at: "2026-11-11T00:00:00Z" });
const history = (text = "hello") => ({ items: [item(1, "user_message", text)], prevCursor: null });

test("history cache retains more than three sessions and evicts the least recently visited", () => {
  const cache = new SessionHistoryCache(1024 * 1024, 4);
  for (const id of ["a", "b", "c", "d"]) cache.set(id, history());
  cache.get("a");
  cache.set("e", history());
  assert.ok(cache.get("a"));
  assert.equal(cache.get("b"), undefined);
  assert.ok(cache.get("e"));
});

test("byte budget protects the active history but evicts it once inactive if oversized", () => {
  const cache = new SessionHistoryCache(512);
  cache.activate("a");
  cache.set("a", history("中".repeat(300)));
  assert.ok(cache.get("a"));
  cache.set("b", history());
  assert.equal(cache.get("b"), undefined);
  cache.activate("b");
  assert.equal(cache.get("a"), undefined);
  cache.set("b", history());
  assert.ok(cache.get("b"));
});

test("switching keeps the boundary of a fully loaded completed turn", () => {
  const cache = new SessionHistoryCache();
  cache.activate("a");
  const items = Array.from({ length: 400 }, (_, index) => item(index + 1));
  items[100] = item(101, "turn_started");
  items[399] = item(400, "turn_completed");
  cache.set("a", { items, prevCursor: null });
  cache.activate("b");
  const retained = cache.get("a")!;
  assert.equal(retained.items[0].type, "turn_started");
  assert.equal(retained.items.length, 300);
  assert.equal(retained.prevCursor, "101");
});

test("separate host caches never share histories", () => {
  const local = new SessionHistoryCache();
  const remote = new SessionHistoryCache();
  local.set("same-id", history());
  assert.equal(remote.get("same-id"), undefined);
});
