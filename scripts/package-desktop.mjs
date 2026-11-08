import { packager } from "@electron/packager";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Build output only: never copy source checkouts, credentials, or development dependencies.
await mkdir("build", { recursive: true });
const staging = await mkdtemp(path.resolve("build/package-"));
try {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  for (const name of ["dist", "dist-electron", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    await cp(name, path.join(staging, name), { recursive: true });
  }
  // Backend TypeScript is not bundled; retain its one external runtime dependency.
  await cp("node_modules/undici", path.join(staging, "node_modules/undici"), { recursive: true, dereference: true });
  await writeFile(path.join(staging, "package.json"), JSON.stringify({
    name: pkg.name, productName: pkg.productName, version: pkg.version,
    main: pkg.main, license: pkg.license,
  }));
  const options = {
    dir: staging, out: "build/desktop", overwrite: true,
    name: "Zotigo", executableName: "zotigo-desktop",
    appBundleId: "com.zotigo.desktop", appVersion: pkg.version,
    icon: path.resolve(process.platform === "darwin" ? "resources/zotigo.icns" : process.platform === "win32" ? "resources/zotigo.ico" : "public/brand/zotigo-app.png"),
    extendInfo: { CFBundleDisplayName: "Zotigo" },
    electronVersion: JSON.parse(await readFile("node_modules/electron/package.json", "utf8")).version,
    // Use the hashes shipped with that exact, lockfile-pinned Electron package,
    // just like its installer. Cached binaries still undergo SHA-256 validation.
    download: { checksums: JSON.parse(await readFile("node_modules/electron/checksums.json", "utf8")) },
    platform: process.platform, arch: process.arch, prune: false,
  };
  let packages;
  for (let attempt = 1; ; attempt++) {
    try {
      packages = await packager(options);
      break;
    } catch (error) {
      // Retry transient release download responses only, never packaging or
      // checksum failures. Keep a finite bound for installers and CI alike.
      if (attempt >= 4 || ![429, 502, 503, 504].includes(error?.response?.status)) throw error;
      console.warn(`Electron download returned ${error.response.status}; retrying (${attempt}/3).`);
      await delay(attempt * 5000);
    }
  }
  for (const directory of packages) console.log(directory);
} finally {
  await rm(staging, { recursive: true, force: true });
}
