import { conversationShouldLoadOlder } from "@zotigo/shared/conversationScroll";

// A layout/anchor adjustment must not request the next history page. Only a new
// user gesture can arm another page, including a continued upward wheel gesture.
export class HistoryPaginationGesture {
  private armed = false;
  arm() {
    this.armed = true;
  }
  cancel() {
    this.armed = false;
  }
  consume(following: boolean, offset: number, ready: boolean) {
    if (!ready) {
      this.armed = false;
      return false;
    }
    if (!this.armed || !conversationShouldLoadOlder(following, offset))
      return false;
    this.armed = false;
    return true;
  }
}

// Deduplicate corrections caused by repeated measurement notifications. Offset
// comes from the measured content size, not scrollToEnd's estimated final row.
export class TimelineScrollMetrics {
  constructor(private readonly inverted = false) {}
  offset = 0;
  contentHeight = 0;
  viewportHeight = 0;
  private requestedOffset: number | undefined;
  resetCorrection() {
    this.requestedOffset = undefined;
  }
  correction() {
    if (!this.viewportHeight) return undefined;
    const target = this.inverted
      ? 0
      : Math.max(0, this.contentHeight - this.viewportHeight);
    if (Math.abs(target - this.offset) < 1 || target === this.requestedOffset)
      return undefined;
    this.requestedOffset = target;
    return target;
  }
}

// Once someone starts reading, completion of a tool/reasoning group must not
// remove the rows under their finger. Explicit disclosure choices still win.
export function retainExpandedTimelineGroups(
  rows: readonly { kind: string; key: string; open?: boolean }[],
  disclosures: Record<string, boolean>,
): Record<string, boolean> {
  const expanded = rows.filter(
    (row) =>
      row.kind === "activity" && row.open && disclosures[row.key] === undefined,
  );
  if (!expanded.length) return disclosures;
  return {
    ...disclosures,
    ...Object.fromEntries(expanded.map((row) => [row.key, true])),
  };
}
