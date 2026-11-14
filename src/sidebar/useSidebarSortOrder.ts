import { useRef, useState } from "react";
import { reorderSidebarIds, type DropPosition } from "../../shared/sidebarOrdering";
import type { SidebarDragItem, SidebarDropTarget, SidebarSortProps } from "../app/appTypes";

export interface SidebarSortOrderArgs {
  isBusy: boolean;
  persistSidebarOrder: (kind: SidebarDragItem["kind"], scopeId: string, orderedIds: string[]) => Promise<void>;
}

export interface SidebarSortOrder {
  sidebarSortProps: (item: SidebarDragItem, orderedIds: string[], fixedPosition?: DropPosition) => SidebarSortProps;
}

// Owns the sidebar drag-and-drop ordering state: the dragged item and the current drop target.
export function useSidebarSortOrder({ isBusy, persistSidebarOrder }: SidebarSortOrderArgs): SidebarSortOrder {
  const [sidebarDragItem, setSidebarDragItem] = useState<SidebarDragItem | null>(null);
  const [sidebarDropTarget, setSidebarDropTarget] = useState<SidebarDropTarget | null>(null);
  const sidebarDragItemRef = useRef<SidebarDragItem | null>(null);

  function sidebarSortProps(item: SidebarDragItem, orderedIds: string[], fixedPosition?: DropPosition): SidebarSortProps {
    const isCurrentTarget = sidebarDropTarget?.kind === item.kind
      && sidebarDropTarget.scopeId === item.scopeId
      && sidebarDropTarget.id === item.id;
    return {
      draggable: !isBusy,
      dragging: sidebarDragItem?.kind === item.kind && sidebarDragItem.scopeId === item.scopeId && sidebarDragItem.id === item.id,
      dropPosition: isCurrentTarget ? sidebarDropTarget.position : undefined,
      onDragStart: (event) => {
        if (event.target instanceof Element && event.target.closest(".project-collapse-button, .workspace-collapse-button, .project-row-actions, .workspace-row-actions, .sidebar-session-actions")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        sidebarDragItemRef.current = item;
        setSidebarDragItem(item);
        setSidebarDropTarget(null);
      },
      onDragOver: (event) => {
        const dragged = sidebarDragItemRef.current;
        if (!dragged || dragged.kind !== item.kind || dragged.scopeId !== item.scopeId || dragged.id === item.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = fixedPosition ?? (event.clientY < bounds.top + bounds.height / 2 ? "before" : "after");
        setSidebarDropTarget({ ...item, position });
      },
      onDrop: (event) => {
        const dragged = sidebarDragItemRef.current;
        if (!dragged || dragged.kind !== item.kind || dragged.scopeId !== item.scopeId) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = fixedPosition ?? (event.clientY < bounds.top + bounds.height / 2 ? "before" : "after");
        sidebarDragItemRef.current = null;
        setSidebarDragItem(null);
        setSidebarDropTarget(null);
        const reorderedIds = reorderSidebarIds(orderedIds, dragged.id, item.id, position);
        if (reorderedIds === orderedIds || reorderedIds.every((id, index) => id === orderedIds[index])) return;
        void persistSidebarOrder(item.kind, item.scopeId, reorderedIds);
      },
      onDragEnd: () => {
        sidebarDragItemRef.current = null;
        setSidebarDragItem(null);
        setSidebarDropTarget(null);
      },
    };
  }

  return { sidebarSortProps };
}
