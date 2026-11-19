import type { SessionItemsQuery, SessionItemsResponse } from "../shared/zotigod";

// Start from the last confirmed item. Jumping directly to the newest page
// would leave a gap when a disconnected worker has produced over 200 items.
export async function readSessionHistoryTail(
  after: number | undefined,
  load: (query: SessionItemsQuery) => Promise<SessionItemsResponse>,
  current: () => boolean,
  apply: (page: SessionItemsResponse, initial: boolean) => void,
) {
  if (after === 0) {
    // The public API requires positive cursors. The cache previously observed
    // an empty log, so join every page back to the beginning before publishing.
    const pages: SessionItemsResponse[] = [];
    let before: number | undefined;
    while (current()) {
      const page = await load(before === undefined ? { limit: 200 } : { limit: 200, before });
      if (!current()) return;
      pages.push(page);
      if (!page.prev_cursor) break;
      const next = Number(page.prev_cursor);
      if (!Number.isSafeInteger(next) || next <= 0 || next >= (before ?? Infinity) || next !== page.items[0]?.sequence) {
        throw new Error("Invalid session history cursor");
      }
      before = next;
    }
    if (current()) {
      for (const page of pages.reverse()) apply(page, false);
    }
    return;
  }
  while (current()) {
    const page = await load(after === undefined ? { limit: 200 } : { limit: 200, after });
    if (!current()) return;
    const next = page.next_cursor ? Number(page.next_cursor) : undefined;
    if (next !== undefined && (!Number.isSafeInteger(next) || next <= (after ?? 0) || next !== page.items.at(-1)?.sequence)) {
      throw new Error("Invalid session history cursor");
    }
    apply(page, after === undefined);
    if (next === undefined) return;
    after = next;
  }
}
