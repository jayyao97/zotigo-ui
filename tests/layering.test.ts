import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

// The dependency direction described in docs/architecture.md. A layer may
// import itself and the layers listed for it; nothing else.
const allowed: Record<string, string[]> = {
  shared: [],
  backend: ["shared"],
  electron: ["backend", "shared"],
  web: ["backend", "shared"],
  src: ["shared"],
};

test("source layers only import the layers below them", () => {
  const violations: string[] = [];
  for (const layer of Object.keys(allowed)) {
    for (const entry of readdirSync(layer, { recursive: true }).map(String)) {
      if (!/\.tsx?$/.test(entry)) continue;
      const file = join(layer, entry);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:from|import|require\()\s*\(?["'](\.{1,2}\/[^"']+)["']/g)) {
        const target = normalize(join(dirname(file), match[1])).split(sep)[0];
        if (target === layer || !(target in allowed)) continue;
        if (!allowed[layer].includes(target)) violations.push(`${file} imports ${match[1]} (${layer} -> ${target})`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
