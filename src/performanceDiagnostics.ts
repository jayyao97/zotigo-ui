type Sample = { operation: number; action: string; stage: string; at: number; elapsedMs: number; count?: number; cached?: boolean };
const samples: Sample[] = [];
let sequence = 0;

export function traceInteraction(action: "session-switch" | "send-message" | "new-session") {
  const operation = ++sequence;
  const started = performance.now();
  const mark = (stage: string, details: { count?: number; cached?: boolean } = {}) => {
    samples.push({ operation, action, stage, at: Math.round(performance.now()), elapsedMs: Math.round(performance.now() - started), ...details });
    if (samples.length > 300) samples.splice(0, samples.length - 300);
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
      samples.push({ operation: 0, action: "main-thread", stage: "long-task", at: Math.round(entry.startTime), elapsedMs: Math.round(entry.duration) });
    }
    if (samples.length > 300) samples.splice(0, samples.length - 300);
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
