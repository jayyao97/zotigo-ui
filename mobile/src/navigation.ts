export type Routes = {
  Home: undefined;
  Project: { id: string; title: string };
  Workspace: { id: string; title: string };
  Conversation: { id: string; title: string };
  NewSession: { workspaceId?: string; directory?: string };
  Files: { path?: string; sessionId?: string; open?: boolean };
  Settings: undefined;
  Channels: undefined;
  Sources: { projectId: string; title: string };
  SourcePicker: { projectId: string };
};
