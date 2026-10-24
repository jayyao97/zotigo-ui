import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, MessageSquare, Search, SquarePen } from "lucide-react";
import type { DesktopState } from "../shared/clientTypes";
import { searchConversations } from "../shared/searchConversations";

export function SearchPalette({ state, onClose, onSelect, onNewConversation, onNewProject }: {
  state: DesktopState; onClose(): void; onSelect(id: string): void;
  onNewConversation(): void; onNewProject(): void;
}) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const matches = useMemo(() => searchConversations(state, query).slice(0, 50), [state, query]);
  const actions = [
    { id: "new-session", title: t("app.newSession"), icon: SquarePen, run: onNewConversation },
    { id: "new-project", title: t("searchPalette.newProject"), icon: FolderPlus, run: onNewProject },
  ].filter((action) => !query.trim() || action.title.toLowerCase().includes(query.trim().toLowerCase()));
  const count = matches.length + actions.length;
  const active = Math.min(selected, Math.max(0, count - 1));
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  function choose(index: number) {
    onClose();
    if (index < matches.length) onSelect(matches[index].id);
    else actions[index - matches.length]?.run();
  }
  return <dialog ref={dialog} className="search-palette" aria-label={t("searchPalette.searchSessionsAndCommands")}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="search-palette-input"><Search size={19} /><input autoFocus value={query} placeholder={t("searchPalette.searchSessionsOrRunACommand")}
      role="combobox" aria-label={t("searchPalette.searchSessionsOrCommands")} aria-expanded="true" aria-controls="search-palette-results" aria-autocomplete="list"
      aria-activedescendant={count ? `search-result-${active}` : undefined}
      onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(count ? (active + (event.key === "ArrowDown" ? 1 : count - 1)) % count : 0); }
        if (event.key === "Enter" && count) { event.preventDefault(); choose(active); }
      }} /><kbd>{t("searchPalette.esc")}</kbd></div>
    <div id="search-palette-results" role="listbox" className="search-palette-results">
      {matches.length > 0 && <div className="search-palette-heading">{query.trim() ? t("searchPalette.sessions") : t("searchPalette.recentSessions")}</div>}
      {matches.map((item, index) => <div key={item.id} id={`search-result-${index}`} data-index={index} role="option" aria-selected={active === index}
        className="search-palette-row" onMouseMove={() => setSelected(index)} onClick={() => choose(index)}>
        <MessageSquare size={17} /><span>{item.title}</span><small>{item.context}</small>
      </div>)}
      {actions.length > 0 && <div className="search-palette-heading">{t("searchPalette.quickActions")}</div>}
      {actions.map((action, offset) => { const index = matches.length + offset; const Icon = action.icon;
        return <div key={action.id} id={`search-result-${index}`} data-index={index} role="option" aria-selected={active === index}
          className="search-palette-row" onMouseMove={() => setSelected(index)} onClick={() => choose(index)}><Icon size={17} /><span>{action.title}</span></div>;
      })}
      {!count && <p className="search-palette-empty">{t("searchPalette.noMatchingSessionsOrCommands")}</p>}
    </div>
  </dialog>;
}
