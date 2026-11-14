import { useEffect, useRef, useState } from "react";
import type { ClientApi, SessionPage, SessionQuery } from "../shared/clientTypes";
import type { ChannelActivityMode } from "./activitySettings";

type PageState = { ids: string[]; cursor?: string; limit: number };

export function useSessionPages({ client, enabled, activity, channel, workspaces, active, onPage, onConnection }: {
  client: Pick<ClientApi, "querySessions">; enabled: boolean; activity: boolean; channel: ChannelActivityMode;
  workspaces: string[]; active: boolean; onPage(page: SessionPage): void; onConnection?(online: boolean): void;
}) {
  const [pages, setPages] = useState<Record<string, PageState>>({});
  const savedPages = useRef<{client: Pick<ClientApi, "querySessions">; scope: string; pages: Record<string, PageState>} | null>(null);
  const [error, setError] = useState("");
  const callback = useRef(onPage); callback.current = onPage;
  const connection = useRef(onConnection); connection.current = onConnection;
  const refreshRef = useRef<() => void>(() => {});
  const loadRef = useRef<(key: string) => void>(() => {});
  const workspaceKey = [...workspaces].sort().join(",");
  useEffect(() => {
    if (!enabled || !active || !client.querySessions) return;
    let disposed = false;
    const scope = `${activity}:${channel}`;
    if (savedPages.current?.client !== client || savedPages.current?.scope !== scope) savedPages.current = {client,scope,pages:{}};
    const current = savedPages.current.pages;
    const busy = new Set<string>();
    setPages({...current}); setError("");
    const queries = new Map<string, SessionQuery>();
    if (activity) {
      queries.set("unread", {unread: true, channel});
      queries.set("recent", {unread: false, channel});
    } else {
      queries.set("pinned", {pinned: true});
      queries.set("ungrouped", {ungrouped: true});
      for (const id of workspaceKey.split(",").filter(Boolean)) queries.set(id, {workspaceId: id});
    }
    async function load(key: string, more = false) {
      const query = queries.get(key);
      if (!query || busy.has(key) || disposed) return;
      busy.add(key);
      try {
        const previous = current[key];
        if (more && !previous?.cursor) return;
        const since = new Date(); since.setHours(0,0,0,0); since.setDate(since.getDate()-6);
        const limit = more ? 20 : previous?.limit ?? 20;
        const page: SessionPage = {conversations: [], bindings: [], sessions: []};
        let cursor = more ? previous?.cursor : undefined;
        do {
          const next = await client.querySessions!({...query, limit: Math.min(limit-page.conversations.length, 200), since: key === "recent" ? since.toISOString() : undefined, cursor});
          if (disposed) return;
          page.conversations.push(...next.conversations); page.bindings.push(...next.bindings); page.sessions.push(...next.sessions);
          cursor = next.nextCursor;
        } while (cursor && page.conversations.length < limit);
        page.nextCursor = cursor;
        if (disposed) return;
        const ids = page.conversations.map(item => item.id);
        current[key] = {ids: more ? [...new Set([...previous.ids, ...ids])] : ids, cursor: page.nextCursor, limit: more ? previous.limit + 20 : limit};
        callback.current(page);
        connection.current?.(true);
        setPages({...current}); setError("");
      } catch (cause) { if (!disposed) { connection.current?.(false); setError(cause instanceof Error ? cause.message : String(cause)); } }
      finally { busy.delete(key); }
    }
    async function refresh() {
      const keys = [...queries.keys()];
      // A large expanded project must not create an unbounded request burst.
      await Promise.all(Array.from({length: Math.min(4, keys.length)}, async () => {
        while (keys.length && !disposed) { const key = keys.shift()!; await load(key); }
      }));
    }
    loadRef.current = key => { void load(key, true); };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { disposed=true; clearInterval(timer); refreshRef.current=()=>{}; loadRef.current=()=>{}; };
  }, [client, enabled, active, activity, channel, workspaceKey]);
  return {
    error,
    refresh: () => refreshRef.current(),
    activityIDs: new Set([...(pages.unread?.ids ?? []), ...(pages.recent?.ids ?? [])]),
    activityMore: {unread: Boolean(pages.unread?.cursor), recent: Boolean(pages.recent?.cursor)},
    loadActivityMore: (key: string) => loadRef.current(key === "unread" ? "unread" : "recent"),
    ids: (key: string) => pages[key]?.ids,
    hasMore: (key: string) => Boolean(pages[key]?.cursor),
    loadMore: (key: string) => loadRef.current(key),
  };
}
