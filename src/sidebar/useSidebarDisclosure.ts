import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopState } from "../../shared/clientTypes";
import { restoreSidebarDisclosure, serializeSidebarDisclosure, sidebarDisclosureStorageKey } from "../sidebarDisclosure";

export interface SidebarDisclosureArgs {
  clientScope: string;
  projects: DesktopState["projects"];
  workspaces: DesktopState["workspaces"];
}

export interface SidebarDisclosure {
  collapsedProjectIds: Set<string>;
  setCollapsedProjectIds: Dispatch<SetStateAction<Set<string>>>;
  collapsedWorkspaceIds: Set<string>;
  toggleWorkspaceCollapsed: (id: string) => void;
  // Restores the saved disclosure state for the given catalog and enables persisting.
  // The catalog bootstrap calls this once the first catalog snapshot has arrived.
  loadSidebarDisclosure: (projectIds: string[], workspaceIds: string[]) => void;
}

// Owns which projects and workspaces are collapsed in the sidebar, and persists that per client
// scope once it has been loaded.
export function useSidebarDisclosure({ clientScope, projects, workspaces }: SidebarDisclosureArgs): SidebarDisclosure {
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(new Set());
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(new Set());
  const sidebarDisclosureLoadedRef = useRef(false);

  useEffect(() => {
    if (!sidebarDisclosureLoadedRef.current) return;
    try {
      localStorage.setItem(
        sidebarDisclosureStorageKey(clientScope),
        serializeSidebarDisclosure(
          { collapsedProjectIds, collapsedWorkspaceIds },
          projects.map((project) => project.id),
          workspaces.map((workspace) => workspace.id),
        ),
      );
    } catch { /* In-memory disclosure state still works. */ }
  }, [clientScope, collapsedProjectIds, collapsedWorkspaceIds, projects, workspaces]);

  function loadSidebarDisclosure(projectIds: string[], workspaceIds: string[]) {
    let savedDisclosure: string | null = null;
    try { savedDisclosure = localStorage.getItem(sidebarDisclosureStorageKey(clientScope)); } catch { /* Use defaults. */ }
    const disclosure = restoreSidebarDisclosure(savedDisclosure, projectIds, workspaceIds);
    setCollapsedProjectIds(disclosure.collapsedProjectIds);
    setCollapsedWorkspaceIds(disclosure.collapsedWorkspaceIds);
    sidebarDisclosureLoadedRef.current = true;
  }

  function toggleWorkspaceCollapsed(id: string) {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { collapsedProjectIds, setCollapsedProjectIds, collapsedWorkspaceIds, toggleWorkspaceCollapsed, loadSidebarDisclosure };
}
