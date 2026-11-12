import type { DiagnosticSample } from "../shared/diagnostics";

/** Bounded renderer-to-main buffer; control operations can await a complete flush. */
export class DiagnosticBuffer {
  private queue: Array<{ host: string; sample: DiagnosticSample }> = [];
  private pending?: Promise<void>;
  enabled = false;
  dropped = 0;
  constructor(private readonly send: (host: string, samples: DiagnosticSample[]) => Promise<void>) {}
  get flushing() { return !!this.pending; }
  push(host: string, samples: DiagnosticSample[]) {
    if (!this.enabled) return;
    for (const sample of samples) {
      if (this.queue.length >= 500) this.dropped++;
      else this.queue.push({ host, sample });
    }
  }
  async flush(): Promise<void> {
    if (this.pending) { await this.pending; return this.flush(); }
    if (!this.queue.length) return;
    const entries = this.queue.splice(0);
    this.pending = (async () => {
      for (let offset = 0; offset < entries.length; offset += 100) {
        const batch = entries.slice(offset, offset + 100);
        for (const host of new Set(batch.map(entry => entry.host))) {
          const samples = batch.filter(entry => entry.host === host).map(entry => entry.sample);
          try { await this.send(host, samples); } catch { this.dropped += samples.length; }
        }
      }
    })();
    try { await this.pending; } finally { this.pending = undefined; }
  }
}
