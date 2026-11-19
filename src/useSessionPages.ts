import { useEffect, useRef, useState } from "react";
import type { ClientApi, SessionPage, SessionQuery } from "../shared/clientTypes";
import type { ChannelActivityMode } from "./activitySettings";

type PageState = { ids: string[]; cursor?: string; limit: number };

export function useSessionPages({ client, enabled, activity, channel, workspaces, active, workingSessionIds, onPage, onConnection }: {
  client: Pick<ClientApi, "querySessions">; enabled: boolean; activity: boolean; channel: ChannelActivityMode;
  workingSessionIds?: Iterable<string>;
  workspaces: string[]; active: boolean; onPage(page: SessionPage): void; onConnection?(online: boolean): void;
}) {
  const [pages, setPages] = useState<Record<string, PageState>>({});
  const savedPages = useRef<{client: Pick<ClientApi, "querySessions">; scope: string; pages: Record<string, PageState>} | null>(null);
  const [error, setError] = useState("");
  const callback = useRef(onPage); callback.current = onPage;
  const connection = useRef(onConnection); connection.current = onConnection;
  const refreshRef = useRef<() => void>(() => {});
  const loadRef = useRef<(key: string) => void>(() => {});
  const working = useWorkingActivityPage(client, enabled && active && activity, channel, workingSessionIds, callback);
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
    error: error || working.error,
    refresh: () => refreshRef.current(),
    activityIDs: new Set([...(pages.unread?.ids ?? []), ...(pages.recent?.ids ?? []), ...working.ids]),
    activityMore: {unread: Boolean(pages.unread?.cursor), recent: Boolean(pages.recent?.cursor)},
    loadActivityMore: (key: string) => loadRef.current(key === "unread" ? "unread" : "recent"),
    ids: (key: string) => pages[key]?.ids,
    hasMore: (key: string) => Boolean(pages[key]?.cursor),
    loadMore: (key: string) => loadRef.current(key),
  };
}


// Supplement the chronological pages with catalog rows for the host's active
// sessions. Keep their pagination cursors independent of these ID lookups.
function useWorkingActivityPage(
  client: Pick<ClientApi, "querySessions">, enabled: boolean, channel: ChannelActivityMode,
  workingSessionIds: Iterable<string> | undefined, onPage: {current: (page: SessionPage) => void},
) {
  const key = enabled ? Array.from(workingSessionIds ?? []).sort().join(",") : "";
  const [page, setPage] = useState<{client: typeof client; channel: ChannelActivityMode; ids: Map<string,string>}>();
  const [error, setError] = useState("");
  const update = useRef<(ids: string[]) => void>(() => {});
  useEffect(() => {
    const query = client.querySessions;
    setPage(undefined);
    setError("");
    if (!enabled || !query) return;
    let disposed = false;
    let busy = false;
    let active = new Set<string>();
    const checked = new Set<string>();
    const visible = new Map<string, string>();
    const failures = new Map<string, string>();
    const publishError = () => setError(failures.values().next().value ?? "");
    async function load() {
      if (busy) return;
      busy = true;
      try {
        // Re-read the current set between batches: changes to unrelated sessions
        // must not cancel a lookup that is already in flight.
        while (!disposed) {
          const batch = Array.from(active).filter(id => !checked.has(id)).slice(0, 200);
          if (!batch.length) break;
          let next: SessionPage;
          try {
            next = await query!({ids: batch, channel, limit: batch.length});
          } catch (cause) {
            if (disposed) return;
            for (const id of batch) {
              if (!active.has(id)) continue;
              failures.set(id, cause instanceof Error ? cause.message : String(cause));
              checked.add(id); // Retry on the next poll without delaying other IDs.
            }
            publishError();
            continue;
          }
          if (disposed) return;
          for (const id of batch) {
            failures.delete(id);
            visible.delete(id);
            if (active.has(id)) checked.add(id);
          }
          for (const binding of next.bindings) {
            if (active.has(binding.daemon_session_id)) visible.set(binding.daemon_session_id, binding.conversation_id);
          }
          onPage.current(next);
          setPage({client, channel, ids: new Map(visible)});
          publishError();
        }
      } finally { busy = false; }
    }
    update.current = ids => {
      active = new Set(ids);
      for (const id of checked) {
        if (!active.has(id)) { checked.delete(id); visible.delete(id); }
      }
      for (const id of failures.keys()) if (!active.has(id)) failures.delete(id);
      publishError();
      void load();
    };
    const timer = window.setInterval(() => {
      if (!document.hidden && !busy) { checked.clear(); void load(); }
    }, 15000);
    return () => { disposed = true; update.current = () => {}; window.clearInterval(timer); };
  }, [client, channel, enabled, onPage]);
  useEffect(() => { update.current(key ? key.split(",") : []); }, [key, client, channel, enabled]);
  const ids = page?.client === client && page.channel === channel && key
    ? key.split(",").flatMap(id => page.ids.get(id) ?? []) : [];
  return {ids, error};
}
