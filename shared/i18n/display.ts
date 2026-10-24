import { t, type MessageKey } from "./index";

const states: Record<string, MessageKey> = {
  created: "state.created", starting: "state.starting", running: "state.running",
  paused: "state.paused", ended: "state.ended", failed: "state.failed",
  offline: "state.offline", idle: "state.idle", ready: "state.ready",
  error: "state.error", pending: "state.pending", preparing: "state.preparing",
  archived: "state.archived", connected: "state.connected", connecting: "state.connecting",
  disconnected: "state.disconnected", disabled: "state.disabled", stopped: "state.stopped",
  completed: "state.completed", waiting_approval: "state.waiting_approval", queued: "state.queued",
  interrupted: "state.interrupted", initializing: "state.initializing", repairing: "state.repairing",
  deleting: "state.deleting", none: "state.none", minimal: "state.minimal",
  low: "state.low", medium: "state.medium", high: "state.high", xhigh: "state.xhigh",
  max: "state.max", auto: "state.auto", enabled: "state.enabled",
};
// Preserve unfamiliar provider/runtime values as diagnostic data.
export function stateLabel(value: string): string {
  const key = Object.hasOwn(states, value) ? states[value] : undefined;
  return key ? t(key) : value;
}
