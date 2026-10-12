const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("mermaid");
const mobileRoot = path.resolve(__dirname, "../..");
config.watchFolders = [path.resolve(mobileRoot, "..")];
config.resolver.nodeModulesPaths = [
  path.join(mobileRoot, "node_modules"),
  path.resolve(mobileRoot, "../node_modules"),
];
// This alias exists only in the isolated web test entry. Production Metro never reads it.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const requested = path.resolve(
    path.dirname(context.originModulePath),
    moduleName,
  );
  if (
    platform === "web" &&
    requested === path.join(mobileRoot, "src/components/MermaidSurface")
  ) {
    return {
      type: "sourceFile",
      filePath: path.join(__dirname, "mermaidSurface.tsx"),
    };
  }
  for (const module of ["client", "storage", "mermaidRuntime"]) {
    if (requested === path.join(mobileRoot, "src/platform", module)) {
      return {
        type: "sourceFile",
        filePath: path.join(__dirname, module + ".ts"),
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
