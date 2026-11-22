import type { SessionReadState, ZotigoSession } from "./zotigod";

// Polling and mutations can finish out of order. Never restore an older unread
// flag after another client has acknowledged that version.
export function mergeReadState(current: SessionReadState | undefined, incoming: SessionReadState | undefined): SessionReadState | undefined {
  if (!current) return incoming;
  if (!incoming || incoming.version < current.version) return current;
  if (incoming.version === current.version && incoming.read_version < current.read_version) return current;
  return incoming;
}

export function mergeSessionReadStates(current: ZotigoSession[], incoming: ZotigoSession[]): ZotigoSession[] {
  const previous = new Map(current.map(session => [session.id, session.read_state]));
  return incoming.map(session => ({ ...session, read_state: mergeReadState(previous.get(session.id), session.read_state) }));
}

export function canAcknowledgeSession(state: SessionReadState | undefined, visibleSequence: number, foreground: boolean): boolean {
  return !!state?.unread && foreground && state.completed_sequence <= visibleSequence;
}

