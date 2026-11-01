import assert from "node:assert/strict";
import test from "node:test";
import { promptTitle } from "../backend/catalogService";

test("untitled directory sessions are labelled by their latest prompt", () => {
  assert.equal(promptTitle(undefined), "");
  assert.equal(promptTitle("  fix the\n parser  "), "fix the parser");
  const long = "x".repeat(80);
  assert.equal(promptTitle(long), `${"x".repeat(57)}...`);
});

test("manual approval policy has its own label", async () => {
  const { approvalPolicyLabel } = await import("../shared/approvalPolicy");
  assert.equal(approvalPolicyLabel("manual"), "Manual");
  assert.equal(approvalPolicyLabel("auto"), "Auto");
  assert.equal(approvalPolicyLabel("bypass_permissions"), "Full access");
});
