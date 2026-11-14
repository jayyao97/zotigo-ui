import { useEffect, useState, type RefObject } from "react";

// Expanded does not mean visible: large project trees can contain hundreds of
// offscreen workspaces. Only nearby lists need status polling and first pages.
export function useVisibleWorkspaces(root: RefObject<HTMLDivElement | null>, revision: string) {
  const [ids, setIDs] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.workspaceId!;
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
      setIDs(new Set(visible));
    }, {root: root.current, rootMargin: "200px 0px"});
    for (const element of root.current.querySelectorAll("[data-workspace-id]")) observer.observe(element);
    return () => observer.disconnect();
  }, [root, revision]);
  return ids;
}
