import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, RefreshCw, Search } from "lucide-react";
import type { ClientApi, DirectoryListing } from "../shared/clientTypes";

interface Props {
  api: ClientApi;
  root: string;
  sessionId?: string;
  selectedPath?: string;
  onOpen(path: string): void;
  onRoot(path: string): void;
}

// Every expanded directory owns its request. Collapsing, refreshing, or changing
// the host/workspace unmounts it, so late responses cannot replace another tree.
function Directory({ api, path, sessionId, selectedPath, onOpen, filter, depth = 0 }: Omit<Props, "root" | "onRoot"> & { path: string; filter: string; depth?: number }) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setListing(null); setError("");
    void api.listDirectory({ path, purpose: "files", sessionId }).then((result) => {
      if (current) setListing(result);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : "Could not read directory.");
    });
    return () => { current = false; };
  }, [api, path, sessionId, attempt]);
  return <div className="workspace-tree-children">
    {error ? <div className="workspace-tree-message" role="alert">{error}<button type="button" onClick={() => setAttempt(attempt + 1)}>Retry</button></div> : !listing ? <div className="workspace-tree-message" role="status">Loading…</div> : <>
      {listing.entries.filter((entry) => entry.kind === "directory" || entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map((entry) => {
        const directory = entry.kind === "directory";
        const open = expanded.includes(entry.path);
        return <div key={entry.path}>
          <button type="button" className={`workspace-tree-row ${selectedPath === entry.path ? "selected" : ""}`} style={{ paddingLeft: 10 + depth * 14 }} title={entry.path} disabled={entry.kind === "unavailable"} aria-expanded={directory ? open : undefined} onClick={() => directory ? setExpanded((paths) => open ? paths.filter((path) => path !== entry.path) : [...paths, entry.path]) : onOpen(entry.path)}>
            {directory ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <FileText size={14} />}<span>{entry.name}</span>
          </button>
          {directory && open && <Directory api={api} path={entry.path} sessionId={sessionId} selectedPath={selectedPath} onOpen={onOpen} filter={filter} depth={depth + 1} />}
        </div>;
      })}
      {listing.entries.length === 0 && <div className="workspace-tree-message">Empty folder</div>}
      {listing.truncated && <div className="workspace-tree-message">First 1,000 entries shown. Open a subfolder to browse further.</div>}
    </>}
  </div>;
}

export function WorkspaceFileTree({ api, root, sessionId, selectedPath, onOpen, onRoot }: Props) {
  const [filter, setFilter] = useState("");
  const [revision, setRevision] = useState(0);
  return <nav className="workspace-file-tree" aria-label="Workspace files">
    <div className="workspace-tree-heading"><Folder size={15} /><span title={root}>{root.split("/").filter(Boolean).at(-1) || "Workspaces"}</span><button type="button" className="icon-button" aria-label="Refresh files" onClick={() => setRevision(revision + 1)}><RefreshCw size={14} /></button></div>
    {root && <button type="button" className="workspace-tree-roots" onClick={() => onRoot("")}>Browse registered roots</button>}
    <label className="workspace-tree-filter"><Search size={14} /><input aria-label="Filter filenames" placeholder="Filter filenames…" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
    <div className="workspace-tree-scroll"><Directory key={`${root}:${sessionId}:${revision}`} api={api} path={root} sessionId={sessionId} selectedPath={selectedPath} onOpen={onOpen} filter={filter} /></div>
  </nav>;
}
