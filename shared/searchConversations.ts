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

export function searchWorkspaces(projects: DesktopState["projects"], workspaces: DesktopState["workspaces"], query: string) {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return [];
  const terms = text.split(/\s+/);
  const names = new Map(projects.map(project => [project.id, project.name]));
  return workspaces.map(workspace => {
    const project = names.get(workspace.project_id) ?? "";
    const title = workspace.title.toLocaleLowerCase();
    const context = `${project} ${title}`.toLocaleLowerCase();
    const rank = title === text ? 0 : title.startsWith(text) ? 1 : 2;
    return { workspace, project, context, rank };
  }).filter(row => terms.every(term => row.context.includes(term)))
    .sort((a, b) => a.rank - b.rank || a.workspace.title.localeCompare(b.workspace.title) || a.project.localeCompare(b.project))
    .slice(0, 50);
}
