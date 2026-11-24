import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { Children, useState, type ReactNode } from "react";

const pageSize = 5;

/** Mounted only while the workspace is expanded, so collapsing resets the page. */
export function WorkspaceSessionList({ children, className, revealIndex = -1, hasMore = false, onMore }: { children: ReactNode; className?: string; revealIndex?: number; hasMore?: boolean; onMore?: () => void }) {
  useLocale();
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sessions = Children.toArray(children);
  return <div className={`sidebar-session-list workspace-sessions${className ? ` ${className}` : ""}`}>
    {sessions.slice(0, visibleCount)}
    {revealIndex >= visibleCount && sessions[revealIndex]}
    {(visibleCount < sessions.length || hasMore) && <button type="button" className="workspace-sessions-more" onClick={() => { if (visibleCount + pageSize >= sessions.length && hasMore) onMore?.(); setVisibleCount(count => count + pageSize); }}>{t("workspaceSessionList.message")}</button>}
  </div>;
}
