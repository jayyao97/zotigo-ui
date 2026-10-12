import { createRequire } from "node:module";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
const require = createRequire(import.meta.url);
const runtime = await readFile(
  require.resolve("mermaid/dist/mermaid.min.js"),
  "utf8",
);
const license = await readFile(require.resolve("mermaid/LICENSE"), "utf8");
const output = new URL("../src/generated/", import.meta.url);
await mkdir(output, { recursive: true });
// A data asset, not a Hermes string literal. Notices travel inside the app asset.
await writeFile(
  new URL("mermaid-runtime.mermaid", output),
  "/*\n" + license + "\n*/\n" + runtime,
);
await rm(new URL("mermaidRuntime.ts", output), { force: true });
await rm(new URL("MERMAID-LICENSE.txt", output), { force: true });
