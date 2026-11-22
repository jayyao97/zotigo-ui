import type { DisplayItem } from "@zotigo/shared/zotigod";
import { hasUnresolvedTurnItems, mergeDisplayItems } from "@zotigo/shared/sessionDisplay";

/**
 * Where to resume loading older history after reopening a cached conversation.
 * Desktop replaced this with its tail reader, so mobile now owns it.
 *
 * The cached cursor stays valid only while the cache and the latest page are
 * contiguous and every turn in them has its start; otherwise older pages are
 * needed again from the latest page's cursor.
 */
export function historyBackfillCursor(
  cachedItems: DisplayItem[],
  cachedPrevCursor: string | null,
  latestItems: DisplayItem[],
  latestPrevCursor: string | null,
): string | null {
  if (cachedItems.length === 0) return latestPrevCursor;
  const cachedLastSequence = cachedItems.reduce((maximum, item) => Math.max(maximum, item.sequence), 0);
  const latestFirstSequence = latestItems.reduce(
    (minimum, item) => Math.min(minimum, item.sequence),
    Number.POSITIVE_INFINITY,
  );
  if (cachedLastSequence + 1 < latestFirstSequence) return latestPrevCursor;
  return hasUnresolvedTurnItems(mergeDisplayItems(cachedItems, latestItems))
    ? latestPrevCursor
    : cachedPrevCursor;
}
