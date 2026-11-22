import test from "node:test";
import assert from "node:assert/strict";
import { highlightCode } from "../src/core/codeHighlight";
import { mermaidDocument } from "../src/core/mermaidDocument";
import {
  stableMarkdownKeys,
  containsMarkdownImage,
} from "../src/core/markdownKeys";
test("highlight spans preserve exact source and distinguish syntax", () => {
  const code = 'const x = "<&\\\'";\n// comment 😀\n';
  const spans = highlightCode(code, "typescript");
  assert.equal(spans.map((s) => s.text).join(""), code);
  assert.ok(new Set(spans.map((s) => s.color)).size > 2);
  for (const info of ["unknown", "", "javascript"]) {
    const big = "x".repeat(20001);
    assert.deepEqual(highlightCode(big, info), [{ text: big }]);
  }
});
test("diagram document blocks network, escapes executable source and bounds input", () => {
  const html = mermaidDocument(
    "/* runtime */",
    'graph TD\nA["</script><script>alert(1)</script>"]',
  );
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("securityLevel:'strict'"));
  assert.ok(!html.includes("<script>alert(1)"));
  assert.throws(() => mermaidDocument("", "a".repeat(50001)));
});
test("completed stream nodes retain keys across reparses", () => {
  const a = stableMarkdownKeys([
    {
      key: "random1",
      type: "paragraph",
      children: [{ key: "rand2", type: "image", children: [] }],
    },
  ]);
  const b = stableMarkdownKeys([
    {
      key: "random3",
      type: "paragraph",
      children: [{ key: "rand4", type: "image", children: [] }],
    },
    { key: "random5", type: "paragraph", children: [] },
  ]);
  assert.equal(a[0].key, b[0].key);
  assert.equal(a[0].children[0].key, b[0].children[0].key);
});

test("images nested under emphasis and links require native View ancestors", () => {
  const image = { type: "image", children: [] };
  assert.equal(
    containsMarkdownImage({
      type: "textgroup",
      children: [
        { type: "strong", children: [{ type: "link", children: [image] }] },
      ],
    }),
    true,
  );
  assert.equal(
    containsMarkdownImage({
      type: "strong",
      children: [{ type: "text", children: [] }],
    }),
    false,
  );
});

test("offline runtime generation is deterministic and preserves upstream code and license", async () => {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { fileURLToPath } = await import("node:url");
  const script = new URL("../scripts/build-mermaid.mjs", import.meta.url);
  execFileSync(process.execPath, [fileURLToPath(script)]);
  const file = new URL(
    "../src/generated/mermaid-runtime.mermaid",
    import.meta.url,
  );
  const first = readFileSync(file, "utf8");
  const source = readFileSync(
    require.resolve("mermaid/dist/mermaid.min.js"),
    "utf8",
  );
  const license = readFileSync(require.resolve("mermaid/LICENSE"), "utf8");
  assert.equal(first, "/*\n" + license + "\n*/\n" + source);
  execFileSync(process.execPath, [fileURLToPath(script)]);
  assert.equal(readFileSync(file, "utf8"), first);
});
