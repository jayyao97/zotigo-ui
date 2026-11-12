export type DiagnosticRange = "hour" | "today" | "all";
export interface DiagnosticSample {
  action: string;
  stage: string;
  at: number;
  timeOrigin?: number;
  elapsedMs: number;
  operation?: number;
  count?: number;
  cached?: boolean;
}
export interface DiagnosticStatus {
  enabled: boolean;
  recording: boolean;
  error: boolean;
  dropped: number;
}
export interface DiagnosticsApi {
  status(): Promise<DiagnosticStatus>;
  enable(enabled: boolean): Promise<DiagnosticStatus>;
  context(): string;
  append(samples: DiagnosticSample[], context?: string): Promise<void>;
  export(range: DiagnosticRange): Promise<boolean>;
  clear(): Promise<void>;
  record(): Promise<void>;
}

// Only known timing marks cross the renderer boundary. No arbitrary console text.
const actions = new Set(["session-switch", "send-message", "new-session", "main-thread", "renderer"]);
const stages = new Set(["start", "optimistic-state", "request", "response", "optimistic-paint-opportunity", "history-paint-opportunity", "backfill-paint-opportunity", "initial-paint-opportunity", "cache-hit", "cache", "history-request", "backfill-start", "backfill-complete", "history-response", "history-state", "long-task", "error", "unhandled-rejection"]);
export function parseDiagnosticSamples(value: unknown): DiagnosticSample[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid diagnostic batch");
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || !actions.has(raw.action) || !stages.has(raw.stage)) throw new Error("Invalid diagnostic sample");
    const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (!number(raw.at) || !number(raw.elapsedMs)) throw new Error("Invalid diagnostic timing");
    return { action: raw.action, stage: raw.stage, at: raw.at, elapsedMs: raw.elapsedMs,
      ...(number(raw.timeOrigin) ? { timeOrigin: raw.timeOrigin } : {}),
      ...(number(raw.operation) ? { operation: raw.operation } : {}),
      ...(number(raw.count) ? { count: raw.count } : {}),
      ...(typeof raw.cached === "boolean" ? { cached: raw.cached } : {}),
    };
  });
}
