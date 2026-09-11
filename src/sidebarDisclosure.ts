const storagePrefix = "zotigo.sidebar-disclosure.v1";

export type SidebarDisclosureState = {
  collapsedProjectIds: Set<string>;
  collapsedWorkspaceIds: Set<string>;
};

export function sidebarDisclosureStorageKey(clientScope: string): string {
  return `${storagePrefix}.${clientScope}`;
}

export function restoreSidebarDisclosure(
  raw: string | null,
  projectIds: Iterable<string>,
  workspaceIds: Iterable<string>,
): SidebarDisclosureState {
  let value: unknown;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const savedProjects = stringSet(record.collapsedProjectIds);
  const savedWorkspaces = stringSet(record.collapsedWorkspaceIds);
  return {
    collapsedProjectIds: new Set([...projectIds].filter((id) => savedProjects.has(id))),
    collapsedWorkspaceIds: new Set([...workspaceIds].filter((id) => savedWorkspaces.has(id))),
  };
}

export function serializeSidebarDisclosure(
  state: SidebarDisclosureState,
  projectIds: Iterable<string>,
  workspaceIds: Iterable<string>,
): string {
  return JSON.stringify({
    collapsedProjectIds: [...projectIds].filter((id) => state.collapsedProjectIds.has(id)),
    collapsedWorkspaceIds: [...workspaceIds].filter((id) => state.collapsedWorkspaceIds.has(id)),
  });
}

function stringSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}
