import assert from "node:assert/strict";
import test from "node:test";
import { formatApprovalArguments } from "../shared/approvalDisplay";

test("command approval display retains additional authority context", () => {
  const formatted = formatApprovalArguments(JSON.stringify({
    command: "curl https://example.com",
    network_approval_context: { host: "example.com", protocol: "https" },
    additional_permissions: { fileSystem: { read: ["/workspace/shared"] } },
  }));

  assert.match(formatted, /curl https:\/\/example\.com/);
  assert.match(formatted, /network_approval_context/);
  assert.match(formatted, /additional_permissions/);
  assert.match(formatted, /\/workspace\/shared/);
});
