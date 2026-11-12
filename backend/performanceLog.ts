import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DiagnosticRange } from "../shared/diagnostics";

const defaults = { fileBytes: 5 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, ageMs: 7 * 86400000, queueBytes: 1024 * 1024 };

/** One desktop process owns this log. All disk operations are serialized and asynchronous. */
export class PerformanceLog {
  private tail: Promise<unknown> = Promise.resolve();
  private pendingBytes = 0;
  private file = "";
  private hour = "";
  private bytes = 0;
  private lastPrune = 0;
  private totalBytes = 0;
  private enabled = false;
  error = false;
  dropped = 0;
  readonly run = randomUUID();
  constructor(readonly directory: string, private readonly version: string, private readonly limits = defaults, private readonly now = Date.now) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => { this.error = true; });
    return result;
  }
  async initialize(): Promise<boolean> {
    return this.serial(async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      try { this.enabled = JSON.parse(await fs.readFile(path.join(this.directory, "settings.json"), "utf8")).enabled === true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.error = true; }
      await this.prune();
      return this.enabled;
    });
  }
  isEnabled() { return this.enabled; }
  async enable(enabled: boolean) {
    await this.serial(async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const target = path.join(this.directory, "settings.json");
      await fs.writeFile(`${target}.tmp`, JSON.stringify({ enabled }), { mode: 0o600 });
      await fs.rename(`${target}.tmp`, target);
      this.enabled = enabled;
      this.error = false;
    });
  }
  append(data: Record<string, unknown>) {
    if (!this.enabled) return;
    const line = JSON.stringify({ ...data, time: new Date(this.now()).toISOString(), run: this.run, version: this.version }) + "\n";
    const size = Buffer.byteLength(line);
    if (size > this.limits.fileBytes || size > 64 * 1024 || this.pendingBytes + size > this.limits.queueBytes) { this.dropped++; return; }
    this.pendingBytes += size;
    void this.serial(async () => {
      try { await this.write(line); } finally { this.pendingBytes -= size; }
    }).catch(() => {});
  }
  async profile(profile: unknown) {
    const line = JSON.stringify({ time: new Date(this.now()).toISOString(), run: this.run, version: this.version, kind: "cpu-profile", profile }) + "\n";
    if (Buffer.byteLength(line) > this.limits.fileBytes) throw new Error("CPU profile exceeded the size limit");
    await this.serial(() => this.write(line));
  }
  private async write(line: string) {
    const date = new Date(this.now()).toISOString();
    const hour = date.slice(0, 13);
    const size = Buffer.byteLength(line);
    if (!this.file || this.hour !== hour || this.bytes + size > this.limits.fileBytes) {
      const directory = path.join(this.directory, date.slice(0, 10));
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      this.file = path.join(directory, `${date.slice(11, 13)}-${randomUUID()}.jsonl`);
      this.hour = hour; this.bytes = 0;
      await fs.writeFile(this.file, "", { flag: "wx", mode: 0o600 });
    }
    await fs.appendFile(this.file, line);
    this.bytes += size;
    this.totalBytes += size;
    // Prune on rotation and at most once a minute otherwise, never once per event.
    if (this.bytes === size || this.totalBytes > this.limits.totalBytes || this.now() - this.lastPrune > 60000) await this.prune();
  }
  private async files() {
    const result: { file: string; size: number; modified: number }[] = [];
    for (const day of await fs.readdir(this.directory, { withFileTypes: true })) {
      if (!day.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue;
      const directory = path.join(this.directory, day.name);
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^\d{2}-[a-f0-9-]+\.jsonl$/.test(entry.name)) continue;
        const file = path.join(directory, entry.name); const stat = await fs.stat(file);
        result.push({ file, size: stat.size, modified: stat.mtimeMs });
      }
    }
    return result.sort((a, b) => a.modified - b.modified || a.file.localeCompare(b.file));
  }
  private async prune() {
    const files = await this.files();
    let total = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      if (this.now() - file.modified <= this.limits.ageMs && total <= this.limits.totalBytes) continue;
      await fs.unlink(file.file); total -= file.size;
      if (file.file === this.file) { this.file = ""; this.bytes = 0; }
    }
    for (const day of await fs.readdir(this.directory, { withFileTypes: true })) {
      if (day.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(day.name)) {
        try { await fs.rmdir(path.join(this.directory, day.name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY") throw error; }
      }
    }
    this.totalBytes = total;
    this.lastPrune = this.now();
  }
  async clear() {
    await this.serial(async () => {
      for (const file of await this.files()) await fs.unlink(file.file);
      this.file = ""; this.hour = ""; this.bytes = 0; this.dropped = 0; this.error = false;
      await this.prune();
    });
  }
  async export(target: string, range: DiagnosticRange) {
    await this.serial(async () => {
      await this.prune();
      const cutoff = range === "hour" ? this.now() - 3600000 : range === "today" ? new Date(this.now()).setHours(0, 0, 0, 0) : 0;
      const files = await this.files();
      // Stream lines and compression: never materialize the entire retention budget in memory.
      async function* lines() {
        let skipped = 0;
        const { createInterface } = await import("node:readline");
        for (const { file } of files) {
          const input = createReadStream(file);
          const reader = createInterface({ input, crlfDelay: Infinity });
          try {
            for await (const line of reader) {
              if (!line) continue;
              try { if (Date.parse(JSON.parse(line).time) >= cutoff) yield line + "\n"; }
              catch { skipped++; }
            }
          } finally { reader.close(); input.destroy(); }
        }
        if (skipped) yield JSON.stringify({ kind: "export-incomplete-records", skipped }) + "\n";
      }
      const temp = `${target}.${randomUUID()}.tmp`;
      try {
        await pipeline(Readable.from(lines()), createGzip(), createWriteStream(temp, { flags: "wx", mode: 0o600 }));
        await fs.rename(temp, target);
      } finally { await fs.rm(temp, { force: true }); }
    });
  }
  async close() { this.enabled = false; await this.flush(); }
  async flush() { await this.tail; }
}
