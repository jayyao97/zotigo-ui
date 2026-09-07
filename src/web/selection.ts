import { parseCatalogSelection, type CatalogSelection } from "../../shared/catalogSelection";

const selectionMutations = new Set([
  "desktop:delete-project",
  "desktop:select-project", "desktop:select-workspace", "desktop:select-conversation",
  "desktop:create-project", "desktop:create-workspace", "desktop:create-conversation-with-session",
  "desktop:archive-workspace", "desktop:delete-workspace", "desktop:archive-conversation",
]);

export function createBrowserSelection(storage: Pick<Storage, "getItem" | "setItem">) {
  const key = "zotigo.selection";
  let selection: CatalogSelection;
  try { selection = parseCatalogSelection(JSON.parse(storage.getItem(key) ?? "null")); }
  catch { selection = parseCatalogSelection(null); }
  let revision = 0;
  let pending: { promise: Promise<void>; resolve: () => void } | null = null;
  return {
    begin(channel: string) {
      const mutates = selectionMutations.has(channel);
      const requestRevision = mutates ? ++revision : revision;
      let own: typeof pending = null;
      if (mutates) {
        let resolve!: () => void;
        own = { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
        pending?.resolve();
        pending = own;
      }
      const settle = () => {
        own?.resolve();
        if (pending === own) pending = null;
      };
      return {
        selection: { ...selection },
        accept(next: unknown) {
          if (requestRevision === revision) {
            selection = parseCatalogSelection(next);
            if (mutates) ++revision;
            try { storage.setItem(key, JSON.stringify(selection)); }
            catch { /* The tab still works if browser storage is disabled or full. */ }
          }
          settle();
        },
        cancel: settle,
        async project<T>(value: T): Promise<T> {
          // App may already show an optimistic new selection. Do not let an
          // older catalog mutation undo it while that choice is still pending.
          while (pending && pending !== own) await pending.promise;
          return projectSelection(value, selection);
        },
      };
    },
  };
}

function projectSelection<T>(value: T, selection: CatalogSelection): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if ("selectedProjectId" in value && "selectedWorkspaceId" in value && "selectedConversationId" in value) {
    return { ...value, selectedProjectId: selection.projectId, selectedWorkspaceId: selection.workspaceId, selectedConversationId: selection.sessionId };
  }
  if ("state" in value) return { ...value, state: projectSelection(value.state, selection) };
  return value;
}
