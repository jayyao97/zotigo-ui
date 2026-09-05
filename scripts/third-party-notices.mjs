import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Emit to stdout so dependency upgrades can regenerate a reviewable notice file.
const report = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8" }));
const groups = new Map();
for (const packages of Object.values(report)) {
  for (const dependency of packages) {
    for (const directory of dependency.paths) {
      const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
      const files = readdirSync(directory).filter((name) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name) && statSync(path.join(directory, name)).isFile()).sort();
      if (!files.length) throw new Error(`No license file found for ${manifest.name}@${manifest.version}; inspect its distribution before release.`);
      const notices = files.map((name) => readFileSync(path.join(directory, name), "utf8").replaceAll("\r\n", "\n").trim()).join("\n\n");
      const names = groups.get(notices) ?? new Set();
      names.add(`${manifest.name}@${manifest.version}`);
      groups.set(notices, names);
    }
  }
}

let output = "# Third-party notices\n\nGenerated from installed production dependencies with `node scripts/third-party-notices.mjs`. Identical license texts are grouped; copyright statements and additional notices are preserved. These dependencies retain their own license terms.\n\nThis file covers npm production dependencies, not the Electron/Chromium runtime. A packaged Desktop distribution must also retain the license and third-party notice files supplied with its exact Electron binary. Development tools retain their licenses in their installed packages.\n";
const entries = [...groups].map(([notice, names]) => ({ notice, names: [...names].sort() })).sort((a, b) => a.names[0].localeCompare(b.names[0], "en"));
for (const { notice, names } of entries) {
  output += `\n## ${names.join(", ")}\n\n${notice.split("\n").map((line) => line.trimEnd() ? `    ${line.trimEnd()}` : "").join("\n")}\n`;
}
if (process.argv.includes("--check")) {
  if (readFileSync("THIRD_PARTY_NOTICES.md", "utf8") !== output) throw new Error("THIRD_PARTY_NOTICES.md is stale. Regenerate and review it.");
} else process.stdout.write(output);
