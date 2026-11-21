import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, FolderPlus, MessageSquare, Search, SquarePen } from "lucide-react";
import type { ClientApi, SessionPage, DesktopWorkspace, DesktopState } from "../shared/clientTypes";
import { searchConversations, searchWorkspaces } from "../shared/searchConversations";

export function SearchPalette({ state, client, onPage, onClose, onSelect, onSelectWorkspace, onNewConversation, onNewProject }: {
  state: DesktopState; client?: ClientApi; onPage?(page: SessionPage): void; onClose(): void; onSelect(id: string): void;
  onSelectWorkspace(workspace: DesktopWorkspace): void; onNewConversation(): void; onNewProject(): void;
}) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [remote, setRemote] = useState<SessionPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageCallback = useRef(onPage); pageCallback.current = onPage;
  useEffect(() => {
    if (!client?.querySessions) return;
    let disposed = false;
    setLoading(true); setRemote(null); setError("");
    const timer = setTimeout(() => { void client.querySessions!({query, limit: 50}).then(page => {
      if (disposed) return;
      setRemote(page); pageCallback.current?.(page);
    }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!disposed) setLoading(false); }); }, 200);
    return () => { disposed=true; clearTimeout(timer); };
  }, [client, query]);
  const matches = useMemo(() => searchConversations(client ? {...state, conversations: remote?.conversations ?? []} : state, client ? "" : query).slice(0, 50), [state, query, client, remote]);
  const actions = [
    { id: "new-session", title: t("app.newSession"), icon: SquarePen, run: onNewConversation },
    { id: "new-project", title: t("searchPalette.newProject"), icon: FolderPlus, run: onNewProject },
  ].filter((action) => !query.trim() || action.title.toLowerCase().includes(query.trim().toLowerCase()));
  const workspaces = useMemo(() => searchWorkspaces(state.projects, state.workspaces, query), [state.projects, state.workspaces, query]);
  const workspaceRows = workspaces.map(({ workspace, project }) => ({
    key: `workspace:${workspace.id}`, title: workspace.title, context: project, icon: Folder, run: () => onSelectWorkspace(workspace),
  }));
  const sessionRows = matches.map(item => ({
    key: `session:${item.id}`, title: item.title, context: item.context, icon: MessageSquare, run: () => onSelect(item.id),
  }));
  const term = query.trim().toLocaleLowerCase();
  const workspaceGroup = { title: t("searchPalette.workspaces"), rows: workspaceRows };
  const sessionGroup = { title: term ? t("searchPalette.sessions") : t("searchPalette.recentSessions"), rows: sessionRows };
  const exactSession = sessionRows.findIndex(row => term && row.title.toLocaleLowerCase() === term);
  if (exactSession > 0) sessionRows.unshift(...sessionRows.splice(exactSession, 1));
  const groups = exactSession >= 0 && workspaceRows[0]?.title.toLocaleLowerCase() !== term
    ? [sessionGroup, workspaceGroup] : [workspaceGroup, sessionGroup];
  groups.push({ title: t("searchPalette.quickActions"), rows: actions.map(action => ({
    ...action, key: `action:${action.id}`, context: "",
  })) });
  const rows = groups.flatMap(group => group.rows);
  const count = rows.length;
  const active = Math.max(0, rows.findIndex(row => row.key === selected));
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  function choose(index: number) {
    onClose();
    rows[index]?.run();
  }
  return <dialog ref={dialog} className="search-palette" aria-label={t("searchPalette.searchSessionsAndCommands")}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="search-palette-input"><Search size={19} /><input autoFocus value={query} placeholder={t("searchPalette.searchSessionsOrRunACommand")}
      role="combobox" aria-label={t("searchPalette.searchSessionsOrCommands")} aria-expanded="true" aria-controls="search-palette-results" aria-autocomplete="list"
      aria-activedescendant={count ? `search-result-${active}` : undefined}
      onChange={(event) => { setQuery(event.target.value); setSelected(null); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(rows[(active + (event.key === "ArrowDown" ? 1 : count - 1)) % count]?.key ?? null); }
        if (event.key === "Enter" && count) { event.preventDefault(); choose(active); }
      }} /><kbd>{t("searchPalette.esc")}</kbd></div>
    <div id="search-palette-results" role="listbox" className="search-palette-results">
      {groups.filter(group => group.rows.length).map(group => <div key={group.title} role="group" aria-label={group.title}>
        <div className="search-palette-heading">{group.title}</div>
        {group.rows.map(row => {
          const index = rows.indexOf(row);
          const Icon = row.icon;
          return <div key={row.key} id={`search-result-${index}`} data-index={index} role="option" aria-selected={active === index}
            className="search-palette-row" onMouseMove={() => setSelected(row.key)} onClick={() => choose(index)}>
            <Icon size={17} /><span>{row.title}</span>{row.context && <small>{row.context}</small>}
          </div>;
        })}
      </div>)}
      {error && <p role="alert">{error}</p>}
      {loading && <p className="search-palette-empty">{t("activity.loading")}</p>}
      {!loading && !count && <p className="search-palette-empty">{t("searchPalette.noMatchingSessionsOrCommands")}</p>}
    </div>
  </dialog>;
}
