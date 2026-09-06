import type { DesktopState } from "./clientTypes";

export function searchConversations(state: DesktopState, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return state.conversations.map((conversation) => {
    const project = state.projects.find((item) => item.id === conversation.project_id);
    const workspace = state.workspaces.find((item) => item.id === conversation.workspace_id);
    return { ...conversation, context: [project?.name, workspace?.title].filter(Boolean).join(" / ") };
  }).filter((item) => terms.every((term) => `${item.title} ${item.context}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
}
