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
  offset = 0;
  contentHeight = 0;
  viewportHeight = 0;
  private requestedOffset: number | undefined;
  resetCorrection() {
    this.requestedOffset = undefined;
  }
  correction() {
    if (!this.viewportHeight) return undefined;
    const target = Math.max(0, this.contentHeight - this.viewportHeight);
    if (Math.abs(target - this.offset) < 1 || target === this.requestedOffset)
      return undefined;
    this.requestedOffset = target;
    return target;
  }
}
