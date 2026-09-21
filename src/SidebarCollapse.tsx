import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Retain content until the closing transition finishes, then reset its local state. */
export function SidebarCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  const previousOpen = useRef(open);
  const [retained, setRetained] = useState(open);
  const [settled, setSettled] = useState(true);

  useLayoutEffect(() => {
    if (previousOpen.current === open) return;
    previousOpen.current = open;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRetained(open);
      setSettled(true);
      return;
    }
    if (open) setRetained(true);
    setSettled(false);
    // Empty content or a background tab may not emit transitionend.
    const timeout = window.setTimeout(() => {
      setRetained(open);
      setSettled(true);
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [open]);

  return <div
    className={`sidebar-collapse${open ? " is-open" : ""}${open && settled ? " is-settled" : ""}`}
    aria-hidden={!open}
    inert={!open}
    onTransitionEnd={(event) => {
      if (event.target !== event.currentTarget || event.propertyName !== "grid-template-rows") return;
      setRetained(open);
      setSettled(true);
    }}
  >
    <div className="sidebar-collapse-content">{(open || retained) && children}</div>
  </div>;
}
