import assert from "node:assert/strict";
import test from "node:test";
import { favoriteKey, parseModelFavorites } from "../src/modelFavorites";

test("favorites validate persisted data and deduplicate full configurations", () => {
  const codex = { agent: "codex", model: "gpt-6", reasoningEffort: "medium" } as const;
  assert.deepEqual(parseModelFavorites(JSON.stringify([codex, codex, { ...codex, reasoningEffort: "high" }, { agent: "zotigo", profile: "gemini" }, null, { agent: "unknown", model: "x" }, { agent: "codex", model: 4 }, { agent: "zotigo", profile: "" }])), [codex, { ...codex, reasoningEffort: "high" }, { agent: "zotigo", profile: "gemini" }]);
  assert.notEqual(favoriteKey(codex), favoriteKey({ ...codex, reasoningEffort: "high" }));
  for (const raw of [null, "{broken", "{}", "null"]) assert.deepEqual(parseModelFavorites(raw), []);
});
