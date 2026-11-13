import type { DesktopConversation, DesktopState } from "./clientTypes";
import type { ZotigoSession } from "./zotigod";

export interface RecentConversation {
  conversation: DesktopConversation;
  context: string;
  unread: boolean;
  at: number;
}
export interface RecentConversationGroup {
  key: string;
  date?: number;
  entries: RecentConversation[];
}

export function localDateKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function recentConversationGroups(state: DesktopState, sessions: ZotigoSession[], now: number): RecentConversationGroup[] {
  const cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 6);
  const runtimes = new Map(sessions.map(session => [session.id, session]));
  const bindings = new Map(state.bindings.map(binding => [binding.conversation_id, binding.daemon_session_id]));
  const projects = new Map(state.projects.map(project => [project.id, project.name]));
  const workspaces = new Map(state.workspaces.map(workspace => [workspace.id, workspace.title]));
  const timestamp = (value?: string) => { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : 0; };
  const entries = state.conversations.map(conversation => {
    const runtime = runtimes.get(bindings.get(conversation.id) ?? conversation.id);
    const at = Math.max(timestamp(conversation.updated_at), timestamp(conversation.created_at), timestamp(runtime?.updated_at));
    return { conversation, at, unread: runtime?.read_state?.unread === true,
      context: [projects.get(conversation.project_id ?? ""), workspaces.get(conversation.workspace_id ?? "")].filter(Boolean).join(" / ") };
  }).filter(entry => entry.unread || entry.at >= cutoff.getTime())
    .sort((a, b) => b.at - a.at || a.conversation.id.localeCompare(b.conversation.id));
  const groups = new Map<string, RecentConversationGroup>();
  const unread: RecentConversationGroup = { key: "unread", entries: [] };
  for (const entry of entries) {
    if (entry.unread) { unread.entries.push(entry); continue; }
    const key = localDateKey(entry.at);
    if (!groups.has(key)) groups.set(key, { key, date: entry.at, entries: [] });
    groups.get(key)!.entries.push(entry);
  }
  return [...(unread.entries.length ? [unread] : []), ...groups.values()];
}
