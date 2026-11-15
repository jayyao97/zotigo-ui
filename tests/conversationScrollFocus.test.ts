import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("the keyboard-scrollable conversation viewport does not show a full-panel focus outline", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/styles.css"), "utf8");
  const rule = css.match(/\.conversation-scroll\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /outline:\s*none;/);
});
