import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import type { DisplayItem, SessionSearchHit, SessionSearchResponse } from "../../shared/zotigod";
import { textRanges } from "./selectionText";

export function mergeSearchHits(local: SessionSearchHit[], remote: SessionSearchHit[]): SessionSearchHit[] {
  return [...new Map([...remote, ...local].map(hit => [hit.id, hit])).values()].sort((a, b) => b.sequence - a.sequence);
}
export function searchLoadedMessages(items: DisplayItem[], term: string): SessionSearchHit[] {
  if (!term) return [];
  const needle = term.toLowerCase();
  return items.filter(item => ["user_message", "assistant_message", "steering_message"].includes(item.type)).filter(item => {
    const parts = (item.content ?? []).filter(part => part.type === "text");
    const text = parts.length ? parts.map(part => part.text ?? "").join("\n") : item.type === "steering_message" ? item.command?.text ?? "" : "";
    return text.toLowerCase().includes(needle);
  }).slice(-250).map(item => ({ id: item.id, sequence: item.sequence }));
}

type Props = {
  root: RefObject<HTMLDivElement | null>;
  items: DisplayItem[];
  search: (query: string) => Promise<SessionSearchResponse>;
  showHit: (hit: SessionSearchHit, signal: AbortSignal) => Promise<void>;
  onOpen: () => void;
  onClose: () => void;
};
export function ConversationFind({ root, items, search, showHit, onOpen, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [remote, setRemote] = useState<SessionSearchResponse>({ hits: [], truncated: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [navigation, setNavigation] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const actions = useRef({ search, showHit, onOpen, onClose }); actions.current = { search, showHit, onOpen, onClose };
  const local = useMemo(() => searchLoadedMessages(items, term), [items, term]);
  const hits = useMemo(() => mergeSearchHits(local, remote.hits), [local, remote.hits]);
  const hit = hits[index % (hits.length || 1)];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!root.current || root.current.offsetParent === null) return;
      const target = event.target as HTMLElement;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f" && !target.closest('[role="dialog"]') && (!target.closest('.cm-editor') || target.closest('.composer'))) {
        event.preventDefault(); event.stopPropagation(); setOpen(true); input.current?.focus(); input.current?.select();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [root]);
  useEffect(() => {
    if (!open) { setTerm(""); setRemote({ hits: [], truncated: false }); actions.current.onClose(); return; }
    actions.current.onOpen(); input.current?.focus(); input.current?.select();
  }, [open]);
  useEffect(() => {
    let cancelled = false;
    actions.current.onClose();
    if (open) actions.current.onOpen();
    setTerm(""); setRemote({ hits: [], truncated: false }); setIndex(0); setError(""); setBusy(false);
    if (!open || !query.trim()) return;
    if ([...query].length > 256) { setError("Use up to 256 characters."); return; }
    const timer = setTimeout(() => {
      setTerm(query); setBusy(true);
      // Serialize requests and skip superseded queued work. IPC/Web share this
      // behavior; fast typing cannot queue concurrent SQLite scans.
      const job = pending.current.catch(() => {}).then(async () => {
        if (cancelled) return;
        try { const result = await actions.current.search(query); if (!cancelled) setRemote(result); }
        catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Search failed"); }
        finally { if (!cancelled) setBusy(false); }
      });
      pending.current = job;
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query]);
  useEffect(() => {
    if (!open || !term || !hit) return;
    let cancelled = false;
    const controller = new AbortController();
    let target: HTMLElement | undefined;
    let observer: MutationObserver | undefined;
    const locate = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find(node => node.dataset.messageId === hit.id);
    const highlight = () => {
      if (cancelled) return;
      target = locate(); if (!target) return;
      const expand = target.querySelector<HTMLButtonElement>('.user-message-toggle[aria-expanded="false"]');
      if (expand) { expand.click(); return; }
      observer?.disconnect();
      const ranges = textRanges(target, term);
      if (typeof Highlight !== "undefined" && CSS.highlights) CSS.highlights.set("conversation-find-active", new Highlight(...ranges));
      if (ranges.length && root.current) {
        const match = ranges[0].getBoundingClientRect();
        const bounds = root.current.getBoundingClientRect();
        root.current.scrollTop += match.top - bounds.top - root.current.clientHeight / 2;
      } else target.scrollIntoView({ block: "center", behavior: "instant" });
    };
    observer = new MutationObserver(highlight);
    if (root.current) observer.observe(root.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    if (locate()) highlight();
    else {
      // React may commit the fetched window after the request promise resolves.
      // Observe that commit instead of assuming one animation frame is enough.
      void actions.current.showHit(hit, controller.signal).then(highlight).catch(cause => { observer?.disconnect(); if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load message"); });
    }
    return () => { cancelled = true; controller.abort(); observer?.disconnect(); if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.delete("conversation-find-active"); };
  }, [open, term, hit?.id, navigation, root]);
  const move = (delta: number) => { setNavigation(value => value + 1); setIndex(value => hits.length ? (value + delta + hits.length) % hits.length : 0); };
  return <>
    <button type="button" className="icon-button" title="Find in conversation (Ctrl/Cmd+F)" aria-label="Find in conversation" onClick={() => setOpen(value => !value)}><Search size={17} /></button>
    {open && <div className="conversation-find" role="search" aria-label="Find in conversation" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
      <input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find in conversation" aria-label="Search conversation" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); } }} />
      <span role="status">{hits.length ? `${index % hits.length + 1}/${hits.length}${remote.truncated ? "+" : ""}` : "0/0"} messages</span>
      <button type="button" aria-label="Previous match" disabled={!hits.length} onClick={() => move(-1)}><ArrowUp size={16} /></button>
      <button type="button" aria-label="Next match" disabled={!hits.length} onClick={() => move(1)}><ArrowDown size={16} /></button>
      <button type="button" aria-label="Close search" onClick={() => setOpen(false)}><X size={16} /></button>
      {(busy || error || remote.truncated) && <small>{busy ? "Searching history…" : error || "Showing the latest 250 matching messages plus loaded matches. Refine your search."}</small>}
    </div>}
  </>;
}
