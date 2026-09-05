import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdownLink } from "../shared/markdownLinks";

test("classifies external and anchor links", () => {
  assert.deepEqual(parseMarkdownLink("https://example.com/docs"), { kind: "external", url: "https://example.com/docs" });
  assert.deepEqual(parseMarkdownLink("mailto:test@example.com"), { kind: "external", url: "mailto:test@example.com" });
  assert.deepEqual(parseMarkdownLink("#details"), { kind: "anchor", anchor: "details" });
});

test("parses local file line and column references", () => {
  assert.deepEqual(parseMarkdownLink("./main.go:42:7"), { kind: "local", path: "./main.go", line: 42, column: 7 });
  assert.deepEqual(parseMarkdownLink("/workspace/main.go#L18C3"), { kind: "local", path: "/workspace/main.go", line: 18, column: 3 });
  assert.deepEqual(parseMarkdownLink("notes/My%20Plan.md"), { kind: "local", path: "notes/My Plan.md" });
});

test("rejects unsafe and malformed link protocols", () => {
  assert.throws(() => parseMarkdownLink("javascript:alert(1)"), /Unsupported link protocol/);
  assert.throws(() => parseMarkdownLink("custom://host/path"), /Unsupported link protocol/);
  assert.throws(() => parseMarkdownLink("bad%ZZpath"), /invalid URL encoding/);
});
