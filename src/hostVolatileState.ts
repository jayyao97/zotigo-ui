export type HostFileSaveState = { saveStatus: "clean" | "dirty" | "saving" | "error" };

export function hostSwitchHasActiveSave<T extends HostFileSaveState>(
  files: Record<string, T>,
  savesInFlight: number,
): boolean {
  return savesInFlight > 0 || Object.values(files).some((file) => file.saveStatus === "saving");
}

export function normalizeHostFilesForRestore<T extends HostFileSaveState>(files: Record<string, T>): Record<string, T> {
  let next = files;
  for (const [path, file] of Object.entries(files)) {
    if (file.saveStatus !== "saving") continue;
    if (next === files) next = { ...files };
    next[path] = { ...file, saveStatus: "dirty" };
  }
  return next;
}
