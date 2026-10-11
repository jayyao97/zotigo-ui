import test from "node:test";
import assert from "node:assert/strict";
import {
  parseModelFavorites,
  favoriteKey,
} from "@zotigo/shared/modelFavorites";
import {
  defaultThinkingDisclosureOpen,
  parseThinkingDisplayMode,
} from "@zotigo/shared/thinkingDisplay";
import { formatElapsed } from "@zotigo/shared/turnDuration";
import { eventLabel } from "../src/core/eventLabel";
import type { DisplayItem } from "@zotigo/shared/zotigod";

test("favorites retain model and effort identity, discard duplicates and invalid records", () => {
  const a = { agent: "codex" as const, model: "m", reasoningEffort: "medium" };
  const b = { ...a, reasoningEffort: "high" };
  assert.deepEqual(
    parseModelFavorites(JSON.stringify([a, a, b, null, { agent: "codex" }])),
    [a, b],
  );
  assert.notEqual(favoriteKey(a), favoriteKey(b));
  assert.deepEqual(parseModelFavorites("invalid"), []);
});
test("thinking defaults and latest mode agree with Web", () => {
  assert.equal(parseThinkingDisplayMode(null), "expanded");
  assert.equal(defaultThinkingDisclosureOpen("latest", true), true);
  assert.equal(defaultThinkingDisclosureOpen("latest", false), false);
  assert.equal(defaultThinkingDisclosureOpen("collapsed", true), false);
});
test("turn elapsed time handles invalid clocks and minute boundaries", () => {
  assert.equal(
    formatElapsed("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:01:32Z")),
    "1m 32s",
  );
  assert.equal(formatElapsed("invalid", Date.now()), "0s");
});
test("resolved approvals stay quiet, denied tools and questions have readable labels", () => {
  const item = {
    type: "approval_decision",
    approval: { decisions: [{ approved: true }] },
  } as DisplayItem;
  assert.equal(eventLabel(item), "");
  assert.equal(
    eventLabel({
      ...item,
      approval: {
        id: "a",
        decisions: [
          { tool_call_id: "t", approved: false, reason: "Wrong folder" },
        ],
      },
    }),
    "Tool call denied · Wrong folder",
  );
  assert.equal(
    eventLabel({
      type: "interaction_response",
      interaction: { status: "expired" },
    } as DisplayItem),
    "Question expired",
  );
});
