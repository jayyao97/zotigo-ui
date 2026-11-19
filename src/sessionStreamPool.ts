import type { SessionEventEnvelope } from "../shared/clientTypes";
import type { ActiveSessionState } from "../shared/zotigod";

interface PoolCallbacks {
  subscribe(id: string | null): void;
  unsubscribe(id: string | null): void;
  activity(active: ReadonlyMap<string, ActiveSessionState> | null): void;
  catchUp(id: string, signal: AbortSignal): Promise<void>;
}

type Reader = { connected: boolean };

// A null subscription addresses the host activity stream. Body readers are
// ordered by last selection so the current conversation always has a slot.
export class SessionStreamPool {
  private active: ReadonlyMap<string, ActiveSessionState> | null = null;
  private readers = new Map<string, Reader>();
  private tailReads = new Map<string, AbortController>();
  private selected: string | null = null;
  private disposed = false;
  private revision: number | null = null;
  private fallback = false;

  constructor(private callbacks: PoolCallbacks) {}

  start() { this.callbacks.subscribe(null); }

  select(id: string | null) {
    // Reopen a promoted reader to obtain the daemon's complete live preview.
    if (id && id !== this.selected && this.readers.has(id)) this.stop(id);
    this.selected = id;
    this.reconcile();
  }

  upToDate(id: string) {
    return this.readers.get(id)?.connected || (this.selected === id && this.active !== null && !this.active.has(id));
  }

  tracks(id: string) { return this.readers.has(id); }

  receive(envelope: SessionEventEnvelope) {
    if (this.disposed) return;
    const id = envelope.session_id;
    if (id !== null) {
      const reader = this.readers.get(id);
      if (reader && envelope.status) reader.connected = envelope.status === "connected";
      return;
    }
    if (envelope.event?.type === "activity") {
      const { active, revision } = envelope.event;
      const missedUpdates = this.fallback || (this.revision !== null && revision > this.revision + 1);
      this.revision = revision;
      this.fallback = false;
      this.active = new Map(Object.entries(active));
      if (missedUpdates && this.selected && !this.readers.has(this.selected) && !this.active.has(this.selected)) {
        this.catchUp(this.selected);
      }
    } else if (envelope.status === "unsupported" || envelope.status === "reconnecting") {
      this.fallback = true;
      this.revision = null;
      this.active = null;
    } else {
      return;
    }
    this.callbacks.activity(this.active);
    this.reconcile();
  }

  private stop(id: string) {
    this.readers.delete(id);
    this.callbacks.unsubscribe(id);
  }

  private catchUp(id: string) {
    // A newer snapshot can close a second turn while the previous tail read is in flight.
    this.tailReads.get(id)?.abort();
    const request = new AbortController();
    this.tailReads.set(id, request);
    void this.callbacks.catchUp(id, request.signal)
      // The cached cursor only advances through successful pages. A selected
      // session retries on its detail poll; a background session retries on open.
      .catch(() => {})
      .finally(() => {
        if (this.tailReads.get(id) === request) this.tailReads.delete(id);
      });
  }

  private reconcile() {
    for (const id of this.readers.keys()) {
      if (this.active && !this.active.has(id)) {
        // Release transport capacity before fetching the terminal items via RPC.
        this.stop(id);
        this.catchUp(id);
      } else if (this.active === null && id !== this.selected) {
        this.stop(id);
      }
    }
    const id = this.selected;
    if ((!this.active && !this.fallback) || !id || this.readers.has(id) || (this.active && !this.active.has(id))) return;
    if (this.readers.size >= 3) this.stop(this.readers.keys().next().value!);
    this.tailReads.get(id)?.abort();
    this.readers.set(id, { connected: false });
    this.callbacks.subscribe(id);
  }

  dispose() {
    this.disposed = true;
    for (const id of this.readers.keys()) this.stop(id);
    for (const request of this.tailReads.values()) request.abort();
    this.tailReads.clear();
    this.callbacks.unsubscribe(null);
  }
}
