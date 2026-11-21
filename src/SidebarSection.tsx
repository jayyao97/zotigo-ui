import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  name: "pinned" | "projects" | "ungrouped";
  title: string;
  reveal?: boolean;
  dismissReveal?(): void;
  actions?: ReactNode;
  children: ReactNode;
};

export function SidebarSection({ name, title, actions, children, reveal, dismissReveal }: Props) {
  const contentId = useId();
  const storageKey = `zotigo:sidebar-section:${name}:collapsed`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });
  const open = !collapsed || Boolean(reveal);
  function toggle() {
    dismissReveal?.();
    const next = open;
    setCollapsed(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* Keep the in-memory preference. */ }
  }
  return (
    <section className={`sidebar-section ${name}-section`} aria-label={title}>
      <div className="sidebar-section-heading">
        <button type="button" className="sidebar-section-toggle" aria-expanded={open} aria-controls={contentId} onClick={toggle}>
          <span>{title}</span>
          {!open ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
        {actions && <div className="sidebar-section-actions">{actions}</div>}
      </div>
      <div id={contentId} hidden={!open}>{open && children}</div>
    </section>
  );
}
