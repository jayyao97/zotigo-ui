import assert from "node:assert/strict";
import test from "node:test";
import { initializePerformanceDiagnostics, traceInteraction } from "../src/performanceDiagnostics";
import type { DiagnosticsApi } from "../shared/diagnostics";

test("interaction closures preserve their host context across async work and host changes", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  let host = "host-a";
  const records: Array<{ context?: string; stage: string }> = [];
  const api: DiagnosticsApi = {
    context: () => host,
    append: async (samples, context) => { for (const sample of samples) records.push({ context, stage: sample.stage }); },
    status: async () => ({ enabled: true, recording: false, error: false, dropped: 0 }),
    enable: async () => ({ enabled: true, recording: false, error: false, dropped: 0 }),
    clear: async () => {}, export: async () => true, record: async () => {},
  };
  const dispose = initializePerformanceDiagnostics(api);
  try {
    const trace = traceInteraction("session-switch");
    host = "host-b"; trace("history-response");
    traceInteraction("send-message");
    assert.deepEqual(records, [{ context: "host-a", stage: "start" }, { context: "host-a", stage: "history-response" }, { context: "host-b", stage: "start" }]);
  } finally {
    dispose();
    if (previous) Object.defineProperty(globalThis, "window", previous); else delete (globalThis as Record<string, unknown>).window;
  }
});
