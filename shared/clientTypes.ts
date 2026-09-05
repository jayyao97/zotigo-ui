import type {
  SessionState,
  ApprovalPolicy,
  AgentKind,
  ZotigoSession,
  ApprovalDecisionInput,
  ApprovalDecisionResponse,
  SessionItemsQuery,
  SessionItemsResponse,
  SessionDisplayEvent,
  ProfilesResponse,
  SkillsResponse,
  AgentCatalogEntry,
  AgentCatalogResponse,
  CodexSettingsInput,
  ChangeProfileResponse,
  ChangeApprovalPolicyResponse,
  WorkspaceStatus,
  FolderSourceMode,
  WorkspaceArchivePreview,
  CatalogWorkspaceSource,
  WorkspaceDeletePreview,
  ProjectSourceKind,
  MessageImageInput,
  SessionCommandResponse,
} from "./zotigod";

export type SessionEventStreamStatus = "connected" | "reconnecting" | "unsupported";

export interface SessionEventEnvelope {
  session_id: string;
  event?: SessionDisplayEvent;
  status?: SessionEventStreamStatus;
}

export interface DaemonConfig {
  baseUrl: string;
}

export interface DesktopProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type RepositoryAvailability = "available" | "unavailable";

export interface DesktopProjectRepository {
  id: string;
  project_id: string;
  repo_key: string;
  name: string;
  source_path: string;
  git_common_dir: string;
  default_base_ref: string;
  availability: RepositoryAvailability;
  created_at: string;
  updated_at: string;
}

export interface DesktopProjectFolder {
  id: string;
  project_id: string;
  source_key: string;
  name: string;
  source_path: string;
  default_mode: FolderSourceMode;
  availability: RepositoryAvailability;
  created_at: string;
  updated_at: string;
}

export interface SourceCandidate {
  selectedPath: string;
  canonicalPath: string;
  name: string;
  kind: ProjectSourceKind;
}

export interface DesktopWorkspace {
  id: string;
  project_id: string;
  title: string;
  root_path: string;
  status: WorkspaceStatus;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface DeleteWorkspaceInput {
  id: string;
  confirmation: string;
}

export interface DesktopConversation {
  id: string;
  project_id: string | null;
  workspace_id: string | null;
  title: string;
  pinned_at?: string;
  pinned_order?: number;
  workspace_position?: number;
  created_at: string;
  updated_at: string;
}

export interface DaemonSessionBinding {
  conversation_id: string;
  daemon_session_id: string;
  state?: SessionState;
  error?: string;
  daemon_created_at?: string;
  daemon_started_at?: string;
  daemon_ended_at?: string;
  created_at: string;
}

export interface DesktopState {
  projects: DesktopProject[];
  repositories: DesktopProjectRepository[];
  folders: DesktopProjectFolder[];
  workspaces: DesktopWorkspace[];
  conversations: DesktopConversation[];
  bindings: DaemonSessionBinding[];
  selectedProjectId: string | null;
  selectedWorkspaceId: string | null;
  selectedConversationId: string | null;
}

export interface CreateProjectInput {
  name: string;
  sources?: ProjectSourceInput[];
}

export interface ProjectSourceInput {
  path: string;
  folderMode?: FolderSourceMode;
}

export interface CreateWorkspaceInput {
  projectId: string;
  title: string;
  branchName?: string;
  repositories?: Array<{
    repositoryId: string;
    baseRef: string;
  }>;
  folders?: Array<{ folderId: string; mode?: FolderSourceMode }>;
}

export interface AddWorkspaceSourceInput {
  sourceId: string;
  mode?: FolderSourceMode;
  baseRef?: string;
  branchName?: string;
}

export interface CreateConversationInput {
  projectId: string | null;
  workspaceId?: string | null;
  title?: string;
  prompt?: string;
  skills?: string[];
  images?: MessageImageInput[];
  profile?: string;
  approvalPolicy?: ApprovalPolicy;
  agent?: AgentKind;
  model?: string;
  reasoningEffort?: string;
}

export interface SendConversationMessageInput {
  conversationId: string;
  text: string;
  skills?: string[];
  images?: MessageImageInput[];
  approvalPolicy?: ApprovalPolicy;
}

export interface DesktopActionResult {
  state: DesktopState;
  session?: ZotigoSession;
  command?: SessionCommandResponse;
  error?: string;
  errorCode?: string;
}

export interface TextFileSnapshot {
  path: string;
  name: string;
  content: string;
  sizeBytes: number;
  mtimeMs: number;
  readOnly: boolean;
}

export interface OpenMarkdownLinkInput {
  href: string;
  basePath: string | null;
  baseKind: "directory" | "file";
  sessionId?: string;
}

export type OpenMarkdownLinkResult =
  | { kind: "anchor"; anchor: string }
  | { kind: "external" }
  | { kind: "system" }
  | { kind: "text"; file: TextFileSnapshot; line?: number; column?: number };

export interface SaveTextFileInput {
  path: string;
  content: string;
  expectedMtimeMs: number;
  sessionId?: string;
}

export interface ClientApi {
  getDaemonConfig(): Promise<DaemonConfig>;
  getProfiles(workingDirectory?: string): Promise<ProfilesResponse>;
  listSkills(sessionId?: string, forceReload?: boolean): Promise<SkillsResponse>;
  getAgents(): Promise<AgentCatalogResponse>;
  prepareCodex(): Promise<AgentCatalogEntry>;
  listSessions(): Promise<ZotigoSession[]>;
  getSession(id: string): Promise<ZotigoSession>;
  pauseSession(id: string, turnId: string): Promise<SessionCommandResponse>;
  changeSessionProfile(id: string, profile: string): Promise<ChangeProfileResponse>;
  changeSessionApprovalPolicy(id: string, approvalPolicy: ApprovalPolicy): Promise<ChangeApprovalPolicyResponse>;
  submitSessionApproval(id: string, approvalId: string, decisions: ApprovalDecisionInput[]): Promise<ApprovalDecisionResponse>;
  changeSessionCodexSettings(id: string, input: CodexSettingsInput): Promise<ZotigoSession>;
  listSessionItems(id: string, query?: SessionItemsQuery): Promise<SessionItemsResponse>;
  subscribeSessionEvents(id: string, after?: number): Promise<void>;
  unsubscribeSessionEvents(): Promise<void>;
  onSessionEvent(listener: (envelope: SessionEventEnvelope) => void): () => void;
  getDesktopState(): Promise<DesktopState>;
  syncDesktopState?(): Promise<DesktopState>;
  createProject(input: CreateProjectInput): Promise<DesktopState>;
  chooseSourceFolders(): Promise<SourceCandidate[]>;
  addProjectSources(projectId: string, sources: ProjectSourceInput[]): Promise<DesktopState>;
  removeProjectSource(kind: ProjectSourceKind, sourceId: string): Promise<DesktopState>;
  reorderProjects(projectIds: string[]): Promise<DesktopState>;
  selectProject(id: string | null): Promise<DesktopState>;
  renameProject(projectId: string, name: string): Promise<DesktopState>;
  createWorkspace(input: CreateWorkspaceInput): Promise<DesktopState>;
  getWorkspaceSources(id: string): Promise<CatalogWorkspaceSource[]>;
  addWorkspaceSource(id: string, input: AddWorkspaceSourceInput): Promise<CatalogWorkspaceSource[]>;
  retryWorkspace(id: string): Promise<DesktopState>;
  renameWorkspace(id: string, title: string): Promise<DesktopState>;
  reorderWorkspaces(projectId: string, workspaceIds: string[]): Promise<DesktopState>;
  previewWorkspaceArchive(id: string): Promise<WorkspaceArchivePreview>;
  previewWorkspaceDelete(id: string): Promise<WorkspaceDeletePreview>;
  archiveWorkspace(id: string): Promise<DesktopState>;
  deleteWorkspace(input: DeleteWorkspaceInput): Promise<DesktopState>;
  selectWorkspace(id: string | null): Promise<DesktopState>;
  selectConversation(id: string | null): Promise<DesktopState>;
  revealPath(path: string): Promise<void>;
  openMarkdownLink(input: OpenMarkdownLinkInput): Promise<OpenMarkdownLinkResult>;
  saveTextFile(input: SaveTextFileInput): Promise<TextFileSnapshot>;
  downloadImage(url: string): Promise<void>;
  createConversationWithSession(input: CreateConversationInput): Promise<DesktopActionResult>;
  startConversationSession(conversationId: string): Promise<DesktopActionResult>;
  sendConversationMessage(input: SendConversationMessageInput): Promise<DesktopActionResult>;
  suggestConversationTitle(conversationId: string): Promise<DesktopState>;
  renameConversation(conversationId: string, title: string): Promise<DesktopState>;
  setConversationPinned(conversationId: string, pinned: boolean): Promise<DesktopState>;
  reorderWorkspaceConversations(conversationIds: string[]): Promise<DesktopState>;
  reorderPinnedConversations(conversationIds: string[]): Promise<DesktopState>;
  archiveConversation(conversationId: string): Promise<DesktopState>;
}
