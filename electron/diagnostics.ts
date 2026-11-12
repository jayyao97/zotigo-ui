import { app, dialog, ipcMain, type BrowserWindow, type WebContents } from "electron";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createHmac, randomUUID } from "node:crypto";
import { PerformanceLog } from "../backend/performanceLog";
import { parseDiagnosticSamples, type DiagnosticStatus } from "../shared/diagnostics";

export class DesktopDiagnostics {
  private recording = false;
  private profiler?: WebContents;
  private stopTimer?: ReturnType<typeof setTimeout>;
  private stopping?: Promise<void>;
  constructor(private readonly log: PerformanceLog) {}
  status(): DiagnosticStatus { return { enabled: this.log.isEnabled(), recording: this.recording, error: this.log.error, dropped: this.log.dropped }; }
  mark(action: string, data: Record<string, unknown> = {}) { this.log.append({ action, ...data }); }
  host(id: string) { return createHmac("sha256", this.log.run).update(id).digest("hex").slice(0, 12); }

  async start(window: BrowserWindow) {
    if (this.recording || !this.log.isEnabled()) throw new Error("Diagnostics must be enabled and idle");
    const contents = window.webContents;
    if (contents.debugger.isAttached() || contents.isDevToolsOpened()) throw new Error("Close developer tools before recording");
    this.recording = true; this.profiler = contents;
    try {
      contents.debugger.attach("1.3");
      await contents.debugger.sendCommand("Profiler.enable");
      await contents.debugger.sendCommand("Profiler.setSamplingInterval", { interval: 10000 });
      await contents.debugger.sendCommand("Profiler.start");
      this.mark("cpu-profile-start");
      this.stopTimer = setTimeout(() => { void this.stop().catch(() => {}); }, 30000);
    } catch (error) { this.detach(); this.log.error = true; throw error; }
  }
  private detach() {
    clearTimeout(this.stopTimer);
    try { if (this.profiler?.debugger.isAttached()) this.profiler.debugger.detach(); } catch { /* window closed */ }
    this.profiler = undefined; this.recording = false;
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!this.recording) return Promise.resolve();
    this.stopping = (async () => {
      clearTimeout(this.stopTimer);
      try {
        const result = await this.profiler!.debugger.sendCommand("Profiler.stop");
        // CPU profiles contain source locations, not argument values. Remove absolute URLs/paths.
        for (const node of result.profile.nodes ?? []) {
          if (node.callFrame) {
            const name = String(node.callFrame.url || "").split(/[\\/]/).pop()?.split(/[?#]/)[0] || "";
            node.callFrame.url = /^[a-zA-Z0-9_.-]+\.(?:[cm]?js|tsx?|html)$/.test(name) ? name : "";
          }
        }
        await this.log.profile(result.profile);
        this.mark("cpu-profile-complete");
      } catch (error) { this.log.error = true; throw error; }
      finally { this.detach(); this.stopping = undefined; }
    })();
    return this.stopping;
  }
  private async flushRenderer(window: BrowserWindow | null) {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    const contents = window.webContents;
    const nonce = randomUUID();
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); ipcMain.removeListener("diagnostics:flushed", listener); resolve(); };
      const listener = (event: Electron.IpcMainEvent, value: unknown) => {
        if (value === nonce && event.sender === contents && event.senderFrame === contents.mainFrame) done();
      };
      const timer = setTimeout(done, 1500);
      ipcMain.on("diagnostics:flushed", listener);
      contents.send("diagnostics:flush", nonce);
    });
  }
  async shutdown(window: BrowserWindow | null) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.flushRenderer(window).then(() => this.stop()).catch(() => {}).then(() => this.log.close()),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 5000); }),
      ]);
    } finally { clearTimeout(timeout); this.detach(); }
  }
  register(getWindow: () => BrowserWindow | null) {
    ipcMain.handle("diagnostics:control", async (event, action: unknown, value: unknown) => {
      const window = getWindow();
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("Untrusted application caller");
      switch (action) {
        case "status": return this.status();
        case "enable":
          if (typeof value !== "boolean") throw new Error("Invalid diagnostic setting");
          if (!value) await this.stop().catch(() => {});
          await this.log.enable(value);
          this.mark("diagnostics-enabled", { dropped: this.log.dropped });
          return this.status();
        case "append": {
          const batch = value as { host?: unknown; samples?: unknown };
          if (typeof batch?.host !== "string" || batch.host.length > 256) throw new Error("Invalid diagnostic context");
          const host = this.host(batch.host);
          for (const sample of parseDiagnosticSamples(batch.samples)) this.log.append({ ...sample, ...(sample.operation ? { host } : {}), source: "renderer" });
          return;
        }
        case "clear":
          if (this.recording) throw new Error("Recording is in progress");
          await this.log.clear(); return;
        case "export": {
          if (value !== "hour" && value !== "today" && value !== "all") throw new Error("Invalid diagnostic range");
          const result = await dialog.showSaveDialog(window, { defaultPath: `zotigo-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl.gz`, filters: [{ name: "Compressed diagnostics", extensions: ["gz"] }] });
          if (result.canceled || !result.filePath) return false;
          await this.log.export(result.filePath, value); return true;
        }
        case "record": await this.start(window); return;
        default: throw new Error("Unknown diagnostic operation");
      }
    });
    const delay = monitorEventLoopDelay({ resolution: 50 });
    let monitoring = false;
    const timer = setInterval(() => {
      if (this.log.isEnabled()) {
        if (monitoring) this.mark("desktop-event-loop", { maxMs: Math.round(delay.max / 1e6), meanMs: Number.isFinite(delay.mean) ? Math.round(delay.mean / 1e6) : 0 });
        else { delay.enable(); monitoring = true; }
        delay.reset();
      } else if (monitoring) { delay.disable(); monitoring = false; }
    }, 5000);
    timer.unref();
    app.once("will-quit", () => { clearInterval(timer); delay.disable(); this.detach(); });
  }
}
