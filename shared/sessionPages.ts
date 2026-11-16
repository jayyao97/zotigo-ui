import type { DesktopState, SessionPage, SessionQuery } from "./clientTypes";

export function mergeSessionPage(state: DesktopState, page: SessionPage): DesktopState {
  const conversations = new Map(state.conversations.map(item => [item.id, item]));
  const bindings = new Map(state.bindings.map(item => [item.conversation_id, item]));
  for (const item of page.conversations) conversations.set(item.id, item);
  for (const item of page.bindings) bindings.set(item.conversation_id, item);
  return { ...state, conversations: [...conversations.values()].sort((a,b) => (a.workspace_position ?? Number.MAX_SAFE_INTEGER) - (b.workspace_position ?? Number.MAX_SAFE_INTEGER) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)), bindings: [...bindings.values()] };
}

// A paged catalog state carries only the selected session or the first page,
// so a session reached from outside the sidebar pages is fetched by id.
export async function loadSessionIntoState(
  state: DesktopState,
  sessionId: string,
  querySessions?: (query: SessionQuery) => Promise<SessionPage>,
): Promise<{ state: DesktopState; page: SessionPage | null }> {
  if (state.sessionQueryVersion !== 1 || !querySessions || state.bindings.some(item => item.daemon_session_id === sessionId)) return { state, page: null };
  const page = await querySessions({ ids: [sessionId], limit: 1 });
  return { state: mergeSessionPage(state, page), page };
}

export function mergeCatalogStructure(previous: DesktopState, next: DesktopState): DesktopState {
  if (next.sessionQueryVersion !== 1) return next;
  const workspaces = new Set(next.workspaces.map(item => item.id));
  return mergeSessionPage({ ...next,
    conversations: previous.conversations.filter(item => !item.workspace_id || workspaces.has(item.workspace_id)),
    bindings: previous.bindings,
  }, { conversations: next.conversations, bindings: next.bindings, sessions: [] });
}
