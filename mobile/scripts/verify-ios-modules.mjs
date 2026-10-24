import { readFileSync } from "node:fs";
import { join } from "node:path";

const [app, ios] = process.argv.slice(2);
if (!app?.endsWith(".app") || !ios) {
  throw new Error("Usage: node scripts/verify-ios-modules.mjs /path/Zotigo.app /path/mobile/ios");
}
// JS export cannot detect a missing local native module. Check the actual
// executable before installing, including when building from a copied checkout.
const executable = readFileSync(join(app, "Zotigo"));
const provider = readFileSync(
  join(ios, "Pods/Target Support Files/Pods-Zotigo/ExpoModulesProvider.swift"),
  "utf8",
);
for (const module of ["SelectableTextModule", "SkillInputModule"]) {
  if (!provider.includes(`${module}.self`)) {
    throw new Error(`Missing ${module} in ExpoModulesProvider. Rerun pod install.`);
  }
  if (!executable.includes(Buffer.from(module))) {
    throw new Error(`Missing ${module} in the iOS executable. Restore mobile/modules and rerun pod install/build.`);
  }
}
console.log("Local iOS modules are present in the executable.");
