import { Children, useState, type ReactNode } from "react";

const pageSize = 5;

/** Mounted only while the workspace is expanded, so collapsing resets the page. */
export function WorkspaceSessionList({ children }: { children: ReactNode }) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sessions = Children.toArray(children);
  return <div className="sidebar-session-list workspace-sessions">
    {sessions.slice(0, visibleCount)}
    {visibleCount < sessions.length && <button type="button" className="workspace-sessions-more" onClick={() => setVisibleCount((count) => count + pageSize)}>展开显示</button>}
  </div>;
}
