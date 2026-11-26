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

test("copying a link gives its address, or a file link's readable path", async () => {
  const { markdownLinkCopyText } = await import("../shared/markdownLinks");
  assert.equal(markdownLinkCopyText(" https://example.com/a?b=1 "), "https://example.com/a?b=1");
  assert.equal(markdownLinkCopyText("mailto:test@example.com"), "mailto:test@example.com");
  assert.equal(markdownLinkCopyText("notes/My%20Plan.md"), "notes/My Plan.md");
  assert.equal(markdownLinkCopyText("/workspace/main.go#L18C3"), "/workspace/main.go:18:3");
  assert.equal(markdownLinkCopyText("./main.go:42"), "./main.go:42");
  assert.equal(markdownLinkCopyText("#details"), undefined);
  assert.equal(markdownLinkCopyText("javascript:alert(1)"), undefined);
});
