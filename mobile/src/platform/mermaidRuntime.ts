import { Asset } from "expo-asset";
import { File } from "expo-file-system";
/** The packaged offline runtime is read only when its viewer is opened. */
export async function loadMermaidRuntime(): Promise<string> {
  const asset = Asset.fromModule(
    require("../generated/mermaid-runtime.mermaid"),
  );
  await asset.downloadAsync();
  if (!asset.localUri)
    throw new Error("The offline diagram runtime is unavailable.");
  return new File(asset.localUri).text();
}
