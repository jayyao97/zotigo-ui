import { Asset } from "expo-asset";
/** Test-only browser asset adapter; production uses the native packaged file. */
export async function loadMermaidRuntime(): Promise<string> {
  const asset = Asset.fromModule(
    require("../../src/generated/mermaid-runtime.mermaid"),
  );
  const response = await fetch(asset.uri);
  if (!response.ok)
    throw new Error("Offline diagram asset could not be loaded.");
  return response.text();
}
