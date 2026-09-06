import type { SessionEventEnvelope, ClientApi } from "./clientTypes";

export interface ClientTransport {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
  onSessionEvent(listener: (event: SessionEventEnvelope) => void): () => void;
}

/** The same typed operations are carried by IPC on Desktop and HTTP on Web. */
export function createClientApi(transport: ClientTransport): ClientApi {
  const invoke: ClientTransport["invoke"] = (channel, ...args) => {
    // JSON turns array undefined into null; omit absent trailing arguments so
    // HTTP and IPC preserve the same optional-parameter semantics.
    while (args.length && args[args.length - 1] === undefined) args.pop();
    return transport.invoke(channel, ...args);
  };
  return {
    listHosts: () => invoke("hosts:list"),
    saveHost: (input) => invoke("hosts:save", input),
    deleteHost: (id) => invoke("hosts:delete", id),
    testHost: (id) => invoke("hosts:test", id),
    setActiveHost: (id) => invoke("hosts:activate", id),
    inspectHostSources: (paths) => invoke("hosts:inspect", paths),
    getDaemonConfig: () => invoke("daemon:get-config"),
    getProfiles: (workingDirectory) => invoke("daemon:get-profiles", workingDirectory),
    listSkills: (sessionId, forceReload) => invoke("daemon:list-skills", sessionId, forceReload),
    getAgents: () => invoke("daemon:get-agents"),
    prepareCodex: () => invoke("daemon:prepare-codex"),
    listSessions: () => invoke("sessions:list"),
    getSession: (id: string) => invoke("sessions:get", id),
    pauseSession: (id: string, turnId: string) => invoke("sessions:pause", id, turnId),
    changeSessionProfile: (id, profile) => invoke("sessions:change-profile", id, profile),
    changeSessionApprovalPolicy: (id, approvalPolicy) =>
      invoke("sessions:change-approval-policy", id, approvalPolicy),
    submitSessionApproval: (id, approvalId, decisions) =>
      invoke("sessions:submit-approval", id, approvalId, decisions),
    changeSessionCodexSettings: (id, input) => invoke("sessions:change-codex-settings", id, input),
    listSessionItems: (id, query) => invoke("sessions:list-items", id, query),
    subscribeSessionEvents: (id, after) => invoke("sessions:subscribe-events", id, after),
    unsubscribeSessionEvents: () => invoke("sessions:unsubscribe-events"),
    onSessionEvent: transport.onSessionEvent,
    getDesktopState: () => invoke("desktop:get-state"),
    syncDesktopState: () => invoke("desktop:sync-state"),
    createProject: (input) => invoke("desktop:create-project", input),
    chooseSourceFolders: () => invoke("desktop:choose-source-folders"),
    addProjectSources: (projectId, sources) => invoke("desktop:add-project-sources", projectId, sources),
    removeProjectSource: (kind, sourceId) => invoke("desktop:remove-project-source", kind, sourceId),
    reorderProjects: (projectIds) => invoke("desktop:reorder-projects", projectIds),
    selectProject: (id) => invoke("desktop:select-project", id),
    renameProject: (projectId, name) => invoke("desktop:rename-project", projectId, name),
    createWorkspace: (input) => invoke("desktop:create-workspace", input),
    getWorkspaceSources: (id) => invoke("desktop:get-workspace-sources", id),
    addWorkspaceSource: (id, input) => invoke("desktop:add-workspace-source", id, input),
    retryWorkspace: (id) => invoke("desktop:retry-workspace", id),
    renameWorkspace: (id, title) => invoke("desktop:rename-workspace", id, title),
    reorderWorkspaces: (projectId, workspaceIds) => invoke("desktop:reorder-workspaces", projectId, workspaceIds),
    previewWorkspaceArchive: (id) => invoke("desktop:preview-workspace-archive", id),
    previewWorkspaceDelete: (id) => invoke("desktop:preview-workspace-delete", id),
    archiveWorkspace: (id) => invoke("desktop:archive-workspace", id),
    deleteWorkspace: (input) => invoke("desktop:delete-workspace", input),
    selectWorkspace: (id) => invoke("desktop:select-workspace", id),
    selectConversation: (id) => invoke("desktop:select-conversation", id),
    revealPath: (path) => invoke("desktop:reveal-path", path),
    openMarkdownLink: (input) => invoke("desktop:open-markdown-link", input),
    saveTextFile: (input) => invoke("desktop:save-text-file", input),
    downloadImage: (url) => invoke("desktop:download-image", url),
    createConversationWithSession: (input) => invoke("desktop:create-conversation-with-session", input),
    startConversationSession: (conversationId) => invoke("desktop:start-conversation-session", conversationId),
    sendConversationMessage: (input) => invoke("desktop:send-conversation-message", input),
    suggestConversationTitle: (conversationId) => invoke("desktop:suggest-conversation-title", conversationId),
    renameConversation: (conversationId, title) => invoke("desktop:rename-conversation", conversationId, title),
    setConversationPinned: (conversationId, pinned) => invoke("desktop:set-conversation-pinned", conversationId, pinned),
    reorderWorkspaceConversations: (conversationIds) => invoke("desktop:reorder-workspace-conversations", conversationIds),
    reorderPinnedConversations: (conversationIds) => invoke("desktop:reorder-pinned-conversations", conversationIds),
    archiveConversation: (conversationId) => invoke("desktop:archive-conversation", conversationId),
  };
}
