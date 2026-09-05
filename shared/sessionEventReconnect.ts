export const initialSessionEventReconnectDelayMs = 500;
export const maximumSessionEventReconnectDelayMs = 10_000;
export const stableSessionEventConnectionMs = 30_000;

export function sessionEventReconnectPlan(
  currentDelayMs: number,
  evidence: { receivedEvent: boolean; connectedDurationMs: number },
): { delayMs: number; nextDelayMs: number } {
  const stable = evidence.receivedEvent || evidence.connectedDurationMs >= stableSessionEventConnectionMs;
  const delayMs = stable ? initialSessionEventReconnectDelayMs : currentDelayMs;
  return {
    delayMs,
    nextDelayMs: stable
      ? initialSessionEventReconnectDelayMs
      : Math.min(delayMs * 2, maximumSessionEventReconnectDelayMs),
  };
}
