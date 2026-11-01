export type UpdateChannel = "stable" | "development";
export type UpdateAction = "status" | "check" | "channel" | "prepare" | "apply" | "cancel";
export interface UpdateStatus {
  component: "desktop" | "web" | "daemon";
  version: string;
  commit: string;
  custom: boolean;
  channel: UpdateChannel;
  target?: { version: string; commit: string };
  checked_at?: string;
  phase: "idle" | "preparing" | "ready" | "waiting" | "applying" | "verifying" | "completed" | "failed";
  error?: string;
}

export function parseUpdateRequest(action: unknown, channel?: unknown): { action: UpdateAction; channel?: UpdateChannel } {
  if (typeof action !== "string" || !["status", "check", "channel", "prepare", "apply", "cancel"].includes(action)) throw new Error("Invalid update action");
  if (action === "channel" && channel !== "stable" && channel !== "development") throw new Error("Invalid update channel");
  return { action: action as UpdateAction, channel: action === "channel" ? channel as UpdateChannel : undefined };
}

export function parseUpdateStatus(value: unknown): UpdateStatus {
  if (!value || typeof value !== "object") throw new Error("Invalid update status");
  const s = value as UpdateStatus;
  if (!["desktop", "web", "daemon"].includes(s.component) || typeof s.version !== "string" || typeof s.commit !== "string" || typeof s.custom !== "boolean"
    || !["stable", "development"].includes(s.channel) || !["idle", "preparing", "ready", "waiting", "applying", "verifying", "completed", "failed"].includes(s.phase)
    || (s.target !== undefined && (!s.target || typeof s.target.version !== "string" || typeof s.target.commit !== "string"))
    || (s.error !== undefined && typeof s.error !== "string") || (s.checked_at !== undefined && typeof s.checked_at !== "string")) throw new Error("Invalid update status");
  return s;
}
