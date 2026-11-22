import test from "node:test";
import assert from "node:assert/strict";
import { selectionRuns } from "../src/core/selectionRuns";
import { toolDetail } from "../src/core/toolDetail";

test("native selection preserves one inline text buffer with nested Markdown styles", () => {
  const runs = selectionRuns({
    type: "textgroup",
    children: [
      { type: "text", content: "Before " },
      {
        type: "strong",
        children: [
          { type: "em", children: [{ type: "text", content: "中文😀" }] },
        ],
      },
      { type: "softbreak" },
      {
        type: "link",
        attributes: { href: "src/app.ts" },
        children: [{ type: "code_inline", content: "app.ts" }],
      },
    ],
  });
  assert.equal(runs.map((r) => r.text).join(""), "Before 中文😀\napp.ts");
  assert.deepEqual(runs[1], { text: "中文😀", bold: true, italic: true });
  assert.deepEqual(runs[3], { text: "app.ts", code: true, link: "src/app.ts" });
});
test("tool cards show the actual command and output, not serialized call arguments", () => {
  const detail = toolDetail(
    { name: "exec_command", arguments: '{"cmd":"pnpm test","timeout":1000}' },
    { text: "82 tests passed", exit_code: 0 },
  );
  assert.equal(detail.language, "Shell");
  assert.equal(detail.title, "$ pnpm test");
  assert.equal(detail.command, "pnpm test");
  assert.equal(detail.text, "82 tests passed");
  assert.equal(detail.status, "Success");
});
test("tool card failures include exit codes and denied executions", () => {
  assert.equal(
    toolDetail({ name: "shell" }, { text: "failed", exit_code: 1 }).status,
    "Failed",
  );
  const denied = toolDetail(undefined, {
    result_type: "execution-denied",
    reason: "User rejected",
  });
  assert.equal(denied.status, "Failed");
  assert.equal(denied.text, "Denied: User rejected");
});
test("unfinished tools never claim success and generic JSON output remains visible", () => {
  assert.equal(
    toolDetail({ name: "shell", arguments: "pwd" }, undefined, "", true).status,
    "Running",
  );
  assert.equal(
    toolDetail({ name: "shell", arguments: "pwd" }).status,
    undefined,
  );
  const generic = toolDetail(undefined, { json: { count: 3 } });
  assert.equal(generic.language, "plaintext");
  assert.equal(generic.text, '{\n  "count": 3\n}');
});

test("structured exit codes and error result types follow Desktop status rules", () => {
  assert.equal(
    toolDetail({ name: "shell" }, { json: { exitCode: 2 } }).status,
    "Failed",
  );
  assert.equal(
    toolDetail(undefined, { result_type: "error-text", text: "No permission" })
      .status,
    "Failed",
  );
});

test("shell command copy retains multiline text separately from output", () => {
  const command = "printf hello\npwd";
  const detail = toolDetail(
    { name: "shell", arguments: JSON.stringify({ command }) },
    { text: "hello\n/tmp" },
  );
  assert.equal(detail.command, command);
  assert.equal(detail.text, "hello\n/tmp");
  assert.equal(
    toolDetail(
      { name: "read_file", arguments: "file.txt" },
      { text: "contents" },
    ).command,
    undefined,
  );
});
