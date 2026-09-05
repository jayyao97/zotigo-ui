export function catalogRefreshDue(input: {
  syncRequested: boolean;
  desktopStateLoaded: boolean;
  nowMs: number;
  lastAttemptAtMs: number;
  intervalMs: number;
}): boolean {
  return input.syncRequested
    || !input.desktopStateLoaded
    || input.nowMs - input.lastAttemptAtMs >= input.intervalMs;
}

export function catalogSnapshotIsCurrent(startGeneration: number, currentGeneration: number): boolean {
  return startGeneration === currentGeneration;
}

export function scheduledCatalogSyncDue(input: {
  desktopStateLoaded: boolean;
  nowMs: number;
  notBeforeMs: number;
  lastAttemptAtMs: number;
  intervalMs: number;
}): boolean {
  return input.desktopStateLoaded
    && input.nowMs >= input.notBeforeMs
    && input.nowMs - input.lastAttemptAtMs >= input.intervalMs;
}
