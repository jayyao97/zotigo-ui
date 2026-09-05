export interface CatalogSelection {
  projectId: string | null;
  workspaceId: string | null;
  sessionId: string | null;
}

export function parseCatalogSelection(value: unknown): CatalogSelection {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const id = (value: unknown) => typeof value === "string" && value.length <= 256 ? value : null;
  return { projectId: id(record.projectId), workspaceId: id(record.workspaceId), sessionId: id(record.sessionId) };
}

// A Web request owns its selection snapshot. It never writes Desktop's saved
// selection or another tab's state; catalog data and ordering remain shared.
export function createSelectionStore(initial: unknown) {
  let selection = parseCatalogSelection(initial);
  return {
    getCatalogSelection: () => ({ ...selection }),
    setCatalogSelection: (next: CatalogSelection) => { selection = { ...next }; },
  };
}
