import assert from "node:assert/strict";
import test from "node:test";
import { highlightCode } from "../src/highlightCode";

test("highlights a known fenced-code language", () => {
  const result = highlightCode('{"enabled": true}', "json");

  assert.equal(result?.language, "json");
  assert.match(result?.html ?? "", /hljs-attr/);
  assert.match(result?.html ?? "", /hljs-literal/);
});

test("normalizes common Markdown language aliases", () => {
  const result = highlightCode("const answer: number = 42;", "ts");

  assert.equal(result?.language, "typescript");
  assert.match(result?.html ?? "", /hljs-keyword/);
});

test("registers the additional languages used by Codex", () => {
  const result = highlightCode("FROM node:20", "dockerfile");

  assert.equal(result?.language, "dockerfile");
  assert.match(result?.html ?? "", /hljs-keyword/);
});

test("keeps unknown languages on the plain-text fallback", () => {
  assert.equal(highlightCode("example", "not-a-real-language"), null);
});

test("auto-detects small unlabeled blocks and bounds expensive highlighting", () => {
  assert.match(highlightCode("const answer = 42;")?.html ?? "", /hljs-/);
  assert.equal(highlightCode("x".repeat(10_001)), null);
  assert.equal(highlightCode("x".repeat(100_001), "javascript"), null);
});

test("escapes source markup before it enters the rendered HTML", () => {
  const result = highlightCode("<script>alert('unsafe')</script>", "html");

  assert.doesNotMatch(result?.html ?? "", /<script>/);
  assert.match(result?.html ?? "", /&lt;/);
});
