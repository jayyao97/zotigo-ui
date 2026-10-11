import type { DisplayItem, ZotigoSession } from "@zotigo/shared/zotigod";
import type { DaemonClient } from "./client";

interface History {
  items: DisplayItem[];
  prevCursor: string | null;
  session: ZotigoSession | null;
}
// Like Desktop, retain only three inactive histories, with 200 durable items each.
// The immutable connection owns the cache; tokens and transient deltas never enter it.
const histories = new WeakMap<DaemonClient, Map<string, History>>();
export function cachedHistory(
  client: DaemonClient,
  id: string,
): History | undefined {
  if (client.signal.aborted) return;
  const entries = histories.get(client);
  const entry = entries?.get(id);
  if (entry) {
    entries!.delete(id);
    entries!.set(id, entry);
  }
  return entry;
}
export function cacheHistory(
  client: DaemonClient,
  id: string,
  history: History,
) {
  if (client.signal.aborted || !history.items.length) return;
  const entries = histories.get(client) ?? new Map<string, History>();
  const items = history.items.slice(-200);
  const prevCursor =
    items.length < history.items.length
      ? String(Math.max(Number(history.prevCursor) || 0, items[0].sequence))
      : history.prevCursor;
  entries.delete(id);
  entries.set(id, { ...history, items, prevCursor });
  while (entries.size > 3) entries.delete(entries.keys().next().value!);
  histories.set(client, entries);
}
