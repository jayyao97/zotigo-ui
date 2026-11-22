import test from "node:test";
import assert from "node:assert/strict";
import { compatibleReasoningEffort } from "@zotigo/shared/modelSelection";

test("model switches preserve supported effort, then prefer medium over API order", () => {
  assert.equal(
    compatibleReasoningEffort(["low", "medium", "high"], "high"),
    "high",
  );
  assert.equal(
    compatibleReasoningEffort(["low", "medium", "high"], "xhigh"),
    "medium",
  );
  assert.equal(compatibleReasoningEffort(["low", "high"], ""), "low");
  assert.equal(compatibleReasoningEffort([], "high"), "");
});
