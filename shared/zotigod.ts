export type SessionState = "created" | "starting" | "running" | "paused" | "offline" | "ended" | "failed";

export type ApprovalPolicy = "auto" | "bypass_permissions";

export type AgentKind = "zotigo" | "codex";

export interface HealthResponse {
  status: string;
  protocol_version: string;
}

export interface ZotigoSession {
  id: string;
  state: SessionState;
  live: boolean;
  working_directory?: string;
  profile?: string;
  agent?: AgentKind;
  model?: string;
  reasoning_effort?: string;
  approval_policy?: ApprovalPolicy;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  ended_at?: string;
  error?: string;
  error_code?: string;
  working: boolean;
  active_tool?: string;
  context_usage?: {
    tokens: number;
    window: number;
  };
}

export interface SessionListResponse {
  sessions: ZotigoSession[];
}

export type DisplayItemType =
  | "user_message"
  | "steering_message"
  | "session_command"
  | "assistant_message"
  | "error"
  | "turn_started"
  | "turn_paused"
  | "turn_completed"
  | "turn_failed"
  | "turn_interrupted"
  | "approval_request"
  | "approval_decision"
  | "context_compacted"
  | "profile_changed"
  | "profile_change_failed"
  | "approval_policy_changed";

export interface DisplayProfileChange {
  command_id?: string;
  from?: string;
  to?: string;
}

export interface DisplayApprovalPolicyChange {
  command_id?: string;
  from?: ApprovalPolicy;
  to?: ApprovalPolicy;
}

export interface DisplayToolCall {
  id?: string;
  name?: string;
  arguments?: string;
}

export interface DisplayToolResultContentPart {
  type: string;
  text?: string;
  image?: {
    url?: string;
    file_id?: string;
    media_type?: string;
    mime_type?: string;
    size_bytes?: number;
    width?: number;
    height?: number;
  };
}

export interface DisplayToolResult {
  tool_call_id?: string;
  tool_name?: string;
  result_type?: string;
  exit_code?: number;
  text?: string;
  json?: unknown;
  reason?: string;
  content?: DisplayToolResultContentPart[];
  is_error?: boolean;
  metadata?: Record<string, unknown>;
}

export interface DisplayContentPart {
  type: string;
  text?: string;
  image?: CommandImageMetadata;
  tool_call?: DisplayToolCall;
  tool_result?: DisplayToolResult;
}

export interface DisplayTurn {
  id?: string;
  reason?: string;
  status?: string;
  provider_finish_reason?: string;
  last_agent_message?: string;
  duration_ms?: number;
}

export interface DisplayApproval {
  id?: string;
  turn_id?: string;
  pending?: DisplayPendingApproval[];
  decisions?: DisplayApprovalDecision[];
}

export interface DisplayPendingApproval {
  tool_call_id: string;
  tool_name?: string;
  arguments?: string;
  description?: string;
  reason?: string;
  risk_level?: string;
  source?: string;
  requires_snapshot?: boolean;
}

export interface DisplayApprovalDecision {
  tool_call_id: string;
  approved: boolean;
  reason?: string;
  modified_args?: string;
}

export interface ApprovalDecisionInput {
  tool_call_id: string;
  approved: boolean;
  reason?: string;
}

export interface ApprovalDecisionResponse extends DisplayApproval {
  id: string;
  session_id: string;
  turn_id: string;
  status: "pending" | "resolved";
  created_at: string;
  resolved_at?: string;
}

export interface DisplayCommand {
  type?: string;
  text?: string;
  skills?: string[];
  images?: CommandImageMetadata[];
  turn_id?: string;
  reason?: string;
  profile?: string;
  approval_policy?: ApprovalPolicy;
}

export interface DisplayContextCompaction {
  original_tokens: number;
  compressed_tokens: number;
  messages_before: number;
  messages_after: number;
}

export interface DisplayItem {
  id: string;
  sequence: number;
  type: DisplayItemType;
  role?: string;
  content?: DisplayContentPart[];
  turn?: DisplayTurn;
  approval?: DisplayApproval;
  command?: DisplayCommand;
  profile?: DisplayProfileChange;
  approval_policy?: DisplayApprovalPolicyChange;
  context_compaction?: DisplayContextCompaction;
  error?: string;
  created_at: string;
}

export interface SessionItemsQuery {
  limit?: number;
  after?: number;
  before?: number;
}

export interface SessionItemsResponse {
  items: DisplayItem[];
  next_cursor: string;
  prev_cursor: string;
  has_more: boolean;
}

export interface DisplayDelta {
  item_id: string;
  role: "assistant";
  part_type: "text" | "reasoning" | "tool_progress";
  delta: string;
  tool_call_id?: string;
  tool_name?: string;
}

export type SessionDisplayEvent =
  | { type: "item"; item: DisplayItem }
  | { type: "delta"; delta: DisplayDelta };

export interface RuntimeProfile {
  name: string;
  provider: string;
  model: string;
  thinking_level?: string;
}

export interface ProfilesResponse {
  default_profile: string;
  profiles: RuntimeProfile[];
}

export interface SkillSummary {
  name: string;
  description: string;
  scope: string;
  enabled: boolean;
}

export interface SkillDiagnostic {
  code: string;
  message: string;
  scope?: string;
  name?: string;
}

export interface SkillsResponse {
  skills: SkillSummary[];
  diagnostics: SkillDiagnostic[];
}

export interface AgentCapabilities {
  profiles: boolean;
  models: boolean;
  projects?: boolean;
  steering: boolean;
  approvals: boolean;
}

export interface AgentModel {
  id: string;
  display_name: string;
  is_default: boolean;
  supported_reasoning_efforts: string[];
}

export interface AgentCatalogEntry {
  id: AgentKind;
  label: string;
  availability: "available" | "installed";
  version?: string;
  capabilities: AgentCapabilities;
  models?: AgentModel[];
}

export interface AgentCatalogResponse {
  default_agent: AgentKind;
  agents: AgentCatalogEntry[];
}

export interface CodexSettingsInput {
  model: string;
  reasoningEffort: string;
}

export interface ChangeProfileResponse {
  profile: string;
  status: "applied" | "pending";
  command_id?: string;
}

export interface ChangeApprovalPolicyResponse {
  approval_policy: ApprovalPolicy;
  status: "applied" | "pending";
  command_id?: string;
}

export interface TitleSuggestionResponse {
  title: string;
}

export type WorkspaceStatus = "provisioning" | "ready" | "error" | "archiving" | "archived" | "deleting" | "deleted";

export type FolderSourceMode = "direct" | "reference" | "copy";

export interface WorkspaceArchivePreview {
  workspace_id: string;
  workspace_title: string;
  root_path: string;
  worktree_paths: string[];
  dirty_worktree_paths: string[];
}

export interface CatalogProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogSource {
  id: string;
  project_id: string;
  kind: ProjectSourceKind;
  canonical_path: string;
  git_common_dir?: string;
  git_object_format?: string;
  folder_mode?: FolderSourceMode;
  source_key: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogSourceInspection {
  kind: ProjectSourceKind;
  canonical_path: string;
  git_common_dir?: string;
  git_object_format?: string;
  source_key: string;
}

export interface CatalogProjectDetail extends CatalogProject {
  sources: CatalogSource[];
}

export interface CatalogWorkspace {
  id: string;
  project_id: string;
  title: string;
  root_path: string;
  status: WorkspaceStatus;
  error?: string;
  archived_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogSessionOrganization {
  session_id: string;
  project_id: string | null;
  workspace_id: string | null;
  title: string | null;
  pinned_at: string | null;
  pinned_position: number | null;
  workspace_position: number | null;
  self_archived_at: string | null;
  workspace_archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface CatalogSessionProjection {
  runtime: ZotigoSession | null;
  organization: CatalogSessionOrganization | null;
  availability: string;
}

export interface CatalogWorkspaceSourceInput {
  source_id: string;
  mode?: FolderSourceMode;
  base_ref?: string;
  expected_commit?: string;
  branch_name?: string;
}

export interface CatalogWorkspaceSource {
  source: CatalogSource;
  mode?: FolderSourceMode;
  target_path: string;
  base_ref?: string;
  base_commit?: string;
  branch_name?: string;
  worktree_path?: string;
  status: string;
  error?: string;
}

export interface WorkspaceDeletePreview extends WorkspaceArchivePreview {
  session_ids: string[];
  local_branches: string[];
  preserves_sources: boolean;
  preserves_runtime_sessions: boolean;
  preserves_remote_refs: boolean;
  preserves_local_branches: boolean;
}

export interface ProjectDeletePreview {
  project_id: string;
  workspace_ids: string[];
  workspace_roots: string[];
  dirty_worktree_paths: string[];
}

export type ProjectSourceKind = "git" | "folder";

export interface CreateSessionInput {
  workingDirectory?: string;
  workspaceId?: string;
  profile?: string;
  approvalPolicy?: ApprovalPolicy;
  agent?: AgentKind;
  model?: string;
  reasoningEffort?: string;
}

export interface MessageImageInput {
  mime_type: string;
  data_base64: string;
}

export interface CommandImageMetadata {
  url?: string;
  media_type?: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
}

export interface SessionCommandResponse {
  id: string;
  sequence: number;
  type: string;
  text?: string;
  skills?: string[];
  images?: CommandImageMetadata[];
  turn_id?: string;
  reason?: string;
  created_at: string;
}
