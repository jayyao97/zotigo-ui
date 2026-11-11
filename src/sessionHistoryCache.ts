import type { DisplayItem } from "../shared/zotigod";

export type SessionHistory = { items: DisplayItem[]; prevCursor: string | null };

/** Scoped to one mounted host. The active history is never evicted. */
export class SessionHistoryCache {
  private entries = new Map<string, SessionHistory & { bytes: number }>();
  private itemBytes = new WeakMap<DisplayItem, number>();
  private bytes = 0;
  private active: string | null = null;

  constructor(private maxBytes = 32 * 1024 * 1024, private maxEntries = 30) {}

  get(id: string): SessionHistory | undefined {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      this.entries.set(id, entry);
    }
    return entry;
  }

  set(id: string, history: SessionHistory): void {
    let bytes = 0;
    for (const item of history.items) {
      let size = this.itemBytes.get(item);
      if (size === undefined) {
        size = new TextEncoder().encode(JSON.stringify(item)).byteLength;
        this.itemBytes.set(item, size);
      }
      bytes += size;
    }
    this.bytes += bytes - (this.entries.get(id)?.bytes ?? 0);
    this.entries.delete(id);
    this.entries.set(id, { ...history, bytes });
    this.evict();
  }

  activate(id: string | null): void {
    const previous = this.active;
    this.active = id;
    // Keep recent history, but don't cut a loaded turn in half and force the
    // same history backfill on every switch. The byte budget bounds long turns.
    if (previous && previous !== id) {
      const entry = this.entries.get(previous);
      if (entry && entry.items.length > 200) {
        let start = entry.items.length - 200;
        while (start > 0 && entry.items[start].type !== "turn_started") start--;
        while (start > 0 && entry.items[start - 1].type === "user_message") start--;
        if (start > 0) {
          const items = entry.items.slice(start);
          this.set(previous, { items, prevCursor: String(items[0].sequence) });
        }
      }
    }
    if (id) this.get(id);
    this.evict();
  }

  private evict(): void {
    for (const [id, entry] of this.entries) {
      if (this.bytes <= this.maxBytes && this.entries.size <= this.maxEntries) break;
      if (id === this.active) continue;
      this.entries.delete(id);
      this.bytes -= entry.bytes;
    }
  }
}
