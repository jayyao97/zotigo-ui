import type { DiagnosticSample, DiagnosticsApi } from "../shared/diagnostics";
type Sample = { operation: number; action: string; stage: string; at: number; elapsedMs: number; count?: number; cached?: boolean };
const samples: Sample[] = [];
let persistentDiagnostics: DiagnosticsApi | undefined;
export function initializePerformanceDiagnostics(api: DiagnosticsApi | undefined): () => void {
  persistentDiagnostics = api;
  const error = () => record({ operation: 0, action: "renderer", stage: "error", at: Math.round(performance.now()), elapsedMs: 0 });
  const rejection = () => record({ operation: 0, action: "renderer", stage: "unhandled-rejection", at: Math.round(performance.now()), elapsedMs: 0 });
  window.addEventListener("error", error);
  window.addEventListener("unhandledrejection", rejection);
  return () => { persistentDiagnostics = undefined; window.removeEventListener("error", error); window.removeEventListener("unhandledrejection", rejection); };
}
function record(sample: Sample, context?: string) {
  samples.push(sample);
  if (samples.length > 300) samples.splice(0, samples.length - 300);
  void persistentDiagnostics?.append([{ ...sample, timeOrigin: performance.timeOrigin } as DiagnosticSample], context).catch(() => {});
}
let sequence = 0;

export function traceInteraction(action: "session-switch" | "send-message" | "new-session") {
  const operation = ++sequence;
  const context = persistentDiagnostics?.context();
  const started = performance.now();
  const mark = (stage: string, details: { count?: number; cached?: boolean } = {}) => {
    record({ operation, action, stage, at: Math.round(performance.now()), elapsedMs: Math.round(performance.now() - started), ...details }, context);
  };
  mark("start");
  return mark;
}

export function traceNextPaint(mark: ReturnType<typeof traceInteraction>, stage: string) {
  // A second animation frame observes a paint opportunity, not just React state.
  requestAnimationFrame(() => requestAnimationFrame(() => mark(stage)));
}

export function observeLongTasks(): () => void {
  if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes.includes("longtask")) return () => {};
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      record({ operation: 0, action: "main-thread", stage: "long-task", at: Math.round(entry.startTime), elapsedMs: Math.round(entry.duration) });
    }
  });
  observer.observe({ entryTypes: ["longtask"] });
  return () => observer.disconnect();
}

export function exportPerformanceDiagnostics(): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, samples }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "zotigo-performance.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
