import type { ZotigoSession } from "../shared/zotigod";

// List responses omit expensive context details. Preserve the last known value
// until a detail response replaces it, without carrying it across model changes.
export function retainSessionContextUsage(previous: ZotigoSession[], incoming: ZotigoSession[], detailedSessionId?: string): ZotigoSession[] {
  const known = new Map(previous.map(session => [session.id, session]));
  return incoming.map(session => {
    const cached = known.get(session.id);
    if (session.id === detailedSessionId || session.context_usage || !cached?.context_usage
      || session.profile !== cached.profile || session.agent !== cached.agent
      || session.model !== cached.model || session.reasoning_effort !== cached.reasoning_effort) return session;
    return { ...session, context_usage: { ...cached.context_usage, cached: true } };
  });
}
