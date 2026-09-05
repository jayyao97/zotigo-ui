export type DropPosition = "before" | "after";

export function orderSidebarItems<T extends { id: string; created_at: string }>(
  items: T[],
  savedIds: string[],
): T[] {
  const positions = new Map(savedIds.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftPosition = positions.get(left.id);
    const rightPosition = positions.get(right.id);
    if (leftPosition === undefined && rightPosition === undefined) {
      return right.created_at.localeCompare(left.created_at);
    }
    if (leftPosition === undefined) return -1;
    if (rightPosition === undefined) return 1;
    return leftPosition - rightPosition;
  });
}

export function reorderSidebarIds(
  ids: string[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids;
  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  const insertionIndex = position === "after" ? targetIndex + 1 : targetIndex;
  const reordered = [...withoutDragged];
  reordered.splice(insertionIndex, 0, draggedId);
  return reordered;
}
