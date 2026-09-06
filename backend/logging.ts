import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { format } from "node:util";

const maxBytes = 5 * 1024 * 1024;
const maxFiles = 128;
const maxTotalBytes = 100 * 1024 * 1024;

// Processes use separate files, but share a component-wide retention budget.
// Opening/closing on every write avoids retaining deleted files on disk.
export class DiagnosticLog {
  private file: string | undefined;
  private warned = false;

  constructor(private readonly directory: string, private readonly limit = maxBytes, private readonly keep = maxFiles, private readonly budget = maxTotalBytes) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  write(line: string): void {
    let fd: number | undefined;
    try {
      let bytes = Buffer.from(line);
      const entryLimit = Math.min(this.limit, 64 * 1024);
      if (bytes.length > entryLimit) bytes = Buffer.concat([bytes.subarray(0, entryLimit - 14), Buffer.from(" [truncated]\n")]);
      if (this.file) {
        try { fd = fs.openSync(this.file, fs.constants.O_WRONLY | fs.constants.O_APPEND); }
        catch (error) { if (!missing(error)) throw error; }
        if (fd !== undefined && fs.fstatSync(fd).size + bytes.length > this.limit) {
          fs.closeSync(fd);
          fd = undefined;
        }
      }
      if (fd === undefined) {
        this.file = path.join(this.directory, `run-${Date.now()}-${process.pid}-${randomUUID()}.log`);
        fd = fs.openSync(this.file, "wx", 0o600);
      }
      fs.writeFileSync(fd, bytes);
      fs.closeSync(fd);
      fd = undefined;
      const files = fs.readdirSync(this.directory).flatMap((name) => {
        if (!name.startsWith("run-") || !name.endsWith(".log")) return [];
        try {
          const stat = fs.lstatSync(path.join(this.directory, name));
          return stat.isFile() ? [{ name, modified: stat.mtimeMs, size: stat.size }] : [];
        } catch (error) { if (missing(error)) return []; throw error; }
      }).sort((a, b) => a.modified - b.modified || a.name.localeCompare(b.name));
      let total = files.reduce((sum, file) => sum + file.size, 0);
      for (const [index, file] of files.entries()) {
        if (total <= this.budget && files.length - index <= this.keep) break;
        try { fs.unlinkSync(path.join(this.directory, file.name)); }
        catch (error) { if (!missing(error)) throw error; }
        total -= file.size;
      }
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        try { process.stderr.write(`Local logging failed: ${String(error)}\n`); } catch { /* stderr may also be unavailable. */ }
      }
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Logging remains best effort. */ } }
    }
  }
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function startLogging(component: "web" | "desktop"): void {
  let output: DiagnosticLog;
  try { output = new DiagnosticLog(path.join(os.homedir(), ".zotigo", "logs", component)); }
  catch (error) { console.error(`Local logging unavailable: ${String(error)}`); return; }
  const write = (level: string, args: unknown[]) => {
    output.write(`${new Date().toISOString()} [${level}] pid=${process.pid} ${format(...args)}\n`);
  };
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => { write(level, args); original(...args); };
  }
  // Monitor only: preserve Node's normal fatal-error exit behavior.
  process.on("uncaughtExceptionMonitor", (error) => write("fatal", [error]));
  process.on("exit", (code) => write("info", [`${component}_exit code=${code}`]));
  write("info", [`${component}_start node=${process.versions.node}`]);
}
