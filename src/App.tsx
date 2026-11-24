import { SessionStreamPool } from "./sessionStreamPool";
import { readSessionHistoryTail } from "./sessionHistoryTail";
import { useVisibleWorkspaces } from "./useVisibleWorkspaces";
import { useSessionPages } from "./useSessionPages";
import type { ChannelActivityMode } from "./activitySettings";
import { loadSessionIntoState, mergeSessionPage, mergeCatalogStructure } from "../shared/sessionPages";
import { discardUsageCache } from "./usage/useUsageData";
import { observeLongTasks, traceInteraction, traceNextPaint } from "./performanceDiagnostics";
import { LayoutGrid } from "lucide-react";
import { WorkspacePanelHome } from "./WorkspacePanelHome";
import { PendingInteractionNotice } from "./conversation/PendingInteractionNotice";
import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { SidebarResizeHandle, loadSidebarWidth } from "./SidebarResizeHandle";
import { SessionHistoryCache, type SessionHistory } from "./sessionHistoryCache";
import { retainSessionContextUsage } from "./sessionContextCache";
import { addWorkspaceRepositories } from "../shared/addWorkspaceRepositories";
import { referencePrompt } from "../shared/conversationReferences";
import { InputQueue } from "./conversation/InputQueue";
import { CompletionTriggerNavigation } from "./conversation/CompletionTriggerNavigation";
import { SubagentNavigation, type SubagentNavigationValue } from "./conversation/SubagentNavigation";
import { CompletionTriggers } from "./conversation/CompletionTriggers";
import { alternateSendMode, type SendMode } from "./sendMode";
import { ConversationTools, ComposerReferences } from "./conversation/ConversationTools";
import { AttachmentMenu } from "./conversation/AttachmentMenu";
import { AttachmentPreview } from "./AttachmentPreview";
import { SkillPromptEditor, type SkillPromptEditorHandle } from "./SkillPromptEditor";
import { MobileFileNavigation } from "./FilePath";
import type { OpenFileState } from "./openFileState";
import { useLiveFiles } from "./useLiveFiles";
import { useToast } from "./Toast";
import { useConversationTitle } from "./useConversationTitle";
import { useSidebarSortOrder } from "./sidebar/useSidebarSortOrder";
import { useRemoveSourceDialog } from "./project/useRemoveSourceDialog";
import { useSearchPaletteShortcut } from "./app/useSearchPaletteShortcut";
import { useRenameProjectDialog } from "./project/useRenameProjectDialog";
import { useRenameWorkspaceDialog } from "./workspace/useRenameWorkspaceDialog";
import { useTimelineActions } from "./conversation/useTimelineActions";
import type { NavigationItem } from "../shared/clientTypes";
import { loadLastModelSelection, saveLastModelSelection } from "./lastModelSelection";
import { useSavedModelFavorites, type ModelFavorite } from "./modelFavorites";
import { WorkspaceSessionList } from "./WorkspaceSessionList";
import { SidebarCollapse } from "./SidebarCollapse";
import { MarkdownImageContext } from "./MarkdownImage";
import { useSessionSidePanel, type SessionSidePanels } from "./useSessionSidePanel";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { HostMenu } from "./HostShell";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { SearchPalette } from "./SearchPalette";
import { useClient } from "./ClientContext";
import { useForkConversation } from "./conversation/useForkConversation";
import { useApprovalPolicySelection } from "./conversation/useApprovalPolicySelection";
import { useProfileOverrides } from "./conversation/useProfileOverrides";
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type SyntheticEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Circle,
  Crosshair,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Image,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  ListFilter,
  Maximize2,
  Minimize2,
  Pin,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import { titleFromPrompt } from "../shared/conversationTitle";
import {
  conversationAutoFollowAfterScroll,
  conversationAutoFollowAfterWheel,
  conversationScrollIntentForKey,
  conversationShouldLoadOlder,
  type ConversationScrollIntent,
} from "../shared/conversationScroll";
import {
  catalogRefreshDue,
  catalogSnapshotIsCurrent,
  scheduledCatalogSyncDue,
} from "../shared/catalogRefreshPolicy";
import {
  appendDisplayDeltas,
  createOptimisticPromptId,
  acknowledgeOptimisticPrompt,
  authoritativeSessionItems,
  ephemeralDisplayItems,
  hasUnresolvedTurnItems,
  mergeDisplayItems,
  optimisticPromptDisplayItem,
  anchorPromptTimeline,
  capturePromptTimelineAnchor,
  orderDisplayInputs,
  type PromptTimelineAnchor,
  reconcileOptimisticSteering,
  reconcileDisplayPreviews,
  sessionAllowsActiveTurn,
  selectedSessionItemsNeedRefresh,
  selectedTimelineActivity,
  workingConversationIds as workingConversationIdsForSessions,
  type EphemeralDisplayBlock,
} from "../shared/sessionDisplay";
import type { ActiveSessionState, AgentCatalogEntry, AgentKind, ApprovalDecisionInput, DisplayDelta, DisplayItem, RuntimeProfile, SkillSummary, ZotigoSession } from "../shared/zotigod";
import type { DaemonSessionBinding, DesktopActionResult, DesktopConversation, DesktopProject, DesktopState, DesktopWorkspace, SessionPage, WorkspaceFileOpenResult } from "../shared/clientTypes";
import { workspaceHasRepository, workspaceSourceMatches } from "../shared/workspaceSourceSelection";
import { attachmentSizeError, modelImageTypes } from "../shared/messageFiles";
import { RecentSessions } from "./RecentSessions";
import { SidebarSection } from "./SidebarSection";
import { updateSidebarClipping } from "./sidebarClipping";
import { useSidebarDisclosure } from "./sidebar/useSidebarDisclosure";
import {
  closeSidePanelTab,
  retainFileTabs,
  fileSidePanelTab,
  openSidePanelTab,
  subagentSidePanelTab,
  type SidePanelTab,
} from "../shared/sidePanelTabs";
import {
  clampSidePanelWidth,
  defaultSidePanelRatio,
  defaultSidePanelWidth,
  sidePanelWidthForRatio,
} from "../shared/sidePanelSizing";
import type { FileEditorMode } from "./FileEditorTab";
import { hostSwitchHasActiveSave, normalizeHostFilesForRestore } from "./hostVolatileState";
import { ImagePreview } from "./ImagePreview";
import { clipboardFiles } from "./clipboardFiles";
import { matchingSkills, editorSkillTokens, skillPromptText, skillCommandQuery, insertSkillCommand } from "../shared/skillCommands";
import {
  latestActiveTurn,
  latestProfileResult,
  SessionTimeline,
  UserMessage,
  displayContentText,
} from "./conversation/ConversationTimeline";
import { ContextUsageBadge } from "./conversation/ContextUsageBadge";
import {
  buildSubagentRuns,
  SubagentAvatar,
  SubagentOverview,
  SubagentTranscript,
} from "./conversation/SubagentPanel";
import {
  ApprovalPolicyPicker,
  compatibleReasoningEffort,
  ComposerAttachmentStrip,
  ComposerSkills,
  NewSessionPrompt,
  RuntimeSettingsPicker,
  type ComposerAttachment,
} from "./conversation/ConversationComposer";
import type { ThinkingDisplayMode } from "./thinkingDisplay";
import { shouldSmoothStreaming } from "./streamingText";
import { ChannelsPage } from "./channels/ChannelsPage";
import { ProjectDisclosureIcon } from "./SidebarDisclosureIcons";
import { ManagedRepositoryPicker } from "./ManagedRepositoryPicker";
import {
  composerDraftKey as draftKeyForSelection,
  emptyComposerDraft,
  restoreSubmittedDraft,
  updateComposerDrafts,
} from "./composerDrafts";
import { conversationIsVisible, canAcknowledgeSession, mergeReadState, mergeSessionReadStates } from "./unreadSessions";
import type { ComposerDraft, ConversationContextMenu, SidebarDragItem, ConnectionState } from "./app/appTypes";
import { appendUploadedReferences, attachmentToMessageFile, attachmentToMessageImage, revokeDraftAttachments } from "./app/composerAttachments";
import { clearResolvedApprovalPolicyOverrides, connectionLabel, errorMessage, fileNameForPath, isMarkdownFile, isNearScrollBottom, projectSourceInput, sameJsonValue, sessionFromBinding, upsertSession } from "./app/appHelpers";
import { ConversationNavItem } from "./sidebar/ConversationNavItem";
import { ProjectOverview } from "./project/ProjectOverview";
import { OpenWorkspaceFileTab } from "./workspace/OpenWorkspaceFileTab";
import { ArchiveWorkspaceDialog } from "./workspace/ArchiveWorkspaceDialog";
import { DeleteWorkspaceDialog } from "./workspace/DeleteWorkspaceDialog";
import { RenameWorkspaceDialog } from "./workspace/RenameWorkspaceDialog";
import { DeleteProjectDialog } from "./project/DeleteProjectDialog";
import { useChannelsNavigation } from "./channels/useChannelsNavigation";
import { useConversationTitleEditing } from "./conversation/useConversationTitleEditing";
import { useProjectSourceDrafts } from "./project/useProjectSourceDrafts";
import { useWorkspaceLifecycleDialogs } from "./workspace/useWorkspaceLifecycleDialogs";
import { useWorkspaceSourceDrafts } from "./workspace/useWorkspaceSourceDrafts";
import { RenameProjectDialog } from "./project/RenameProjectDialog";
import { RenameConversationDialog } from "./sidebar/RenameConversationDialog";
import { SessionContextMenu } from "./sidebar/SessionContextMenu";
import { SessionEnvironmentList } from "./inspector/SessionEnvironmentList";
import { SubagentSummaryButton } from "./inspector/SubagentSummaryButton";
import { SessionDetailList } from "./inspector/SessionDetailList";
import { AddSourcesDialog } from "./project/AddSourcesDialog";
import { WorkspaceActionMenu } from "./sidebar/WorkspaceActionMenu";
import { ProjectActionMenu } from "./sidebar/ProjectActionMenu";
import { RemoveSourceDialog } from "./project/RemoveSourceDialog";
import { SidebarUtilityNav } from "./sidebar/SidebarUtilityNav";
import { ConversationTitle } from "./conversation/ConversationTitle";
import { SessionInspector } from "./inspector/SessionInspector";
import { WorkspaceBindingList } from "./workspace/WorkspaceBindingList";
import { WorkspaceAddSourceSection } from "./workspace/WorkspaceAddSourceSection";
import { WorkspaceSourcesDialog } from "./workspace/WorkspaceSourcesDialog";
import { CreateWorkspaceSourcesField } from "./workspace/CreateWorkspaceSourcesField";
import { CreateWorkspaceDialog } from "./workspace/CreateWorkspaceDialog";
import { CreateProjectDialog } from "./project/CreateProjectDialog";

type HostVolatileState = {
  desktopState: DesktopState;
  sessions: ZotigoSession[];
  composerDrafts: Record<string, ComposerDraft>;
  openFiles: Record<string, OpenFileState>;
  sessionSidePanels: SessionSidePanels;
};

const pollIntervalMs = 5000;
const catalogReconciliationIntervalMs = 120_000;
const codexCatalogSyncIntervalMs = 5 * 60_000;
const initialCodexCatalogSyncDelayMs = 15_000;
const sessionDeltaFlushIntervalMs = 50;
const volatileStateByHost = new Map<string, HostVolatileState>();
let volatileStateGeneration = 0;

export function discardHostVolatileState(clientScope?: string): void {
  discardUsageCache(clientScope);
  if (clientScope === undefined) volatileStateGeneration++;
  const states = clientScope === undefined
    ? [...volatileStateByHost.entries()]
    : [...volatileStateByHost.entries()].filter(([scope]) => scope === clientScope);
  for (const [scope, state] of states) {
    revokeDraftAttachments(state.composerDrafts);
    volatileStateByHost.delete(scope);
  }
}

const emptyDesktopState: DesktopState = {
  projects: [],
  repositories: [],
  folders: [],
  workspaces: [],
  conversations: [],
  bindings: [],
  selectedProjectId: null,
  selectedWorkspaceId: null,
  selectedConversationId: null,
};

/**
 * Height covered at the top of a scroller by the sticky headers of the groups
 * that contain an element: the bottom of the lowest such header when stuck.
 */
function stickyHeaderHeight(element: Element, scroller: Element): number {
  let covered = 0;
  for (let child: Element = element; child.parentElement && child.parentElement !== scroller; child = child.parentElement) {
    // A group's sticky header precedes its content.
    for (let header = child.previousElementSibling; header; header = header.previousElementSibling) {
      const style = getComputedStyle(header);
      if (style.position !== "sticky") continue;
      covered = Math.max(covered, (Number.parseFloat(style.top) || 0) + header.getBoundingClientRect().height);
    }
  }
  return covered;
}

export default function App({ onConfigureModels, defaultSendMode = "steering", surfaceActive = true, activityChannelMode = "pinned", onSessionQuerySupport, clientScope, hostName, thinkingDisplay, translationLanguage, translationProfile, refreshedCodex, catalogSyncRevision = 0, openNewSessionOnMount = false, openSessionRequest }: { openSessionRequest?: { id: string; nonce: number }; onConfigureModels?: () => void; defaultSendMode?: SendMode; surfaceActive?: boolean; activityChannelMode?: ChannelActivityMode; onSessionQuerySupport?: (supported: boolean) => void; catalogSyncRevision?: number; refreshedCodex?: AgentCatalogEntry; clientScope: string; hostName: string; thinkingDisplay: ThinkingDisplayMode; translationLanguage: "zh-CN" | "en"; translationProfile: string; openNewSessionOnMount?: boolean }) {
  useLocale();
  const [queueRefresh, setQueueRefresh] = useState(0);
  const submitModeRef = useRef<SendMode | null>(null);
  const toast = useToast();
  const restoredHostState = volatileStateByHost.get(clientScope);
  const volatileStateGenerationRef = useRef(volatileStateGeneration);
  const { api: client, kind, remote, signOut } = useClient();
  const navigationRevision = useRef(0);
  const [searchTarget, setSearchTarget] = useState<{ kind: "session" | "workspace"; id: string } | null>(null);
  const { searchOpen, setSearchOpen } = useSearchPaletteShortcut();
  const [webNavigationOpen, setWebNavigationOpen] = useState(false);
  const {
    channelsOpen, repositoriesOpen, setRepositoriesOpen, channelsSidebarActive, channelsSessionVisible, setChannelsSessionVisible,
    channelsNavigationRequest, channelsEntryButton, openChannels, closeChannels, leaveChannelsImmediately,
  } = useChannelsNavigation();
  // The side panel belongs to the visible conversation, including one opened from Channels.
  const sidePanelSurface = !repositoriesOpen && (!channelsOpen || channelsSessionVisible);
  const [channelsSidebarRoot, setChannelsSidebarRoot] = useState<HTMLDivElement | null>(null);
  const webNavigationButton = useRef<HTMLButtonElement>(null);
  const channelsNavigationButton = useRef<HTMLButtonElement>(null);
  const repositoriesNavigationButton = useRef<HTMLButtonElement>(null);
  const webNavigationCloseButton = useRef<HTMLButtonElement>(null);
  const previousWebNavigationOpen = useRef(false);
  useEffect(() => {
    if (webNavigationOpen) webNavigationCloseButton.current?.focus();
    else if (previousWebNavigationOpen.current) {
      (repositoriesOpen ? repositoriesNavigationButton : channelsOpen ? channelsNavigationButton : webNavigationButton).current?.focus();
    }
    previousWebNavigationOpen.current = webNavigationOpen;
  }, [channelsOpen, repositoriesOpen, webNavigationOpen]);
  const [daemonUrl, setDaemonUrl] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [sessions, setSessions] = useState<ZotigoSession[]>(restoredHostState?.sessions ?? []);
  const [desktopState, setDesktopState] = useState<DesktopState>(() => {
    const cached = restoredHostState?.desktopState ?? emptyDesktopState;
    return openNewSessionOnMount ? { ...cached, selectedProjectId: null, selectedWorkspaceId: null, selectedConversationId: null } : cached;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DesktopConversation | null>(null);
  const [archivingSession, setArchivingSession] = useState(false);
  const [recentSessionsOpen, setRecentSessionsOpen] = useState(() => {
    try { return localStorage.getItem("zotigo:sidebar-recent") === "true"; } catch { return false; }
  });
  function showRecentSessions(open: boolean) {
    navigationRevision.current++;
    leaveChannelsImmediately();
    setRecentSessionsOpen(open);
    setConversationContextMenu(null);
    setProjectMenuId(null); setWorkspaceMenuId(null);
    navigationScrollRef.current?.scrollTo({ top: 0 });
    try { localStorage.setItem("zotigo:sidebar-recent", String(open)); } catch { /* Keep the in-memory view. */ }
  }
  const [sidebarActionError, setSidebarActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pauseRequestedTurnId, setPauseRequestedTurnId] = useState<string | null>(null);
  const {
    createProjectOpen, newProjectName, setNewProjectName, newProjectSources, setNewProjectSources,
    newProjectRepositoryIds, setNewProjectRepositoryIds, repositoryAdding, setRepositoryAdding,
    addSourcesProjectId, setAddSourcesProjectId,
    openCreateProjectDialog, closeCreateProjectDialog, chooseNewProjectSources, createNamedProject, addSourcesToProject,
  } = useProjectSourceDrafts({
    client, isBusy, setIsBusy, setMessage, applyDesktopState, setRepositoriesOpen, closeWorkspaceSources: closeWorkspaceSourcesForProjectDrafts,
  });
  const { removeSourceTarget, setRemoveSourceTarget, confirmRemoveSource } = useRemoveSourceDialog({ client, applyDesktopState, setMessage, setIsBusy });
  const {
    createWorkspaceProject, newWorkspaceTitle, newWorkspaceBranch, setNewWorkspaceBranch,
    workspaceSourceQuery, setWorkspaceSourceQuery, addWorkspaceSourceQuery, setAddWorkspaceSourceQuery,
    workspaceRepositories, setWorkspaceRepositories, workspaceFolderModes, setWorkspaceFolderModes,
    workspaceSourcesTarget, workspaceSources, workspaceSourcesLoading, workspaceSourcesLoadError,
    workspaceSourceId, workspaceSourceBaseRef, setWorkspaceSourceBaseRef, workspaceSourceMode, setWorkspaceSourceMode,
    visibleWorkspaceRepositories, visibleWorkspaceFolders, selectedWorkspaceSourceCount,
    canSelectAllWorkspaceSources, canDeselectAllWorkspaceSources,
    openCreateWorkspaceDialog, selectAllWorkspaceSources, closeCreateWorkspaceDialog, updateNewWorkspaceTitle,
    updateRepositoryBaseRef, submitCreateWorkspace,
    openWorkspaceSources, loadWorkspaceSources, closeWorkspaceSources, selectWorkspaceSource,
    confirmAddWorkspaceSource, retryWorkspaceSourceBindings,
  } = useWorkspaceSourceDrafts({
    client, desktopState, isBusy, setIsBusy, setMessage, applyDesktopState, setRepositoriesOpen,
    expandProject, isHostSwitching,
  });
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);
  const [sidebarActionMenuOpensUp, setSidebarActionMenuOpensUp] = useState(false);
  const {
    archiveWorkspaceTarget, workspaceArchivePreview, setWorkspaceArchivePreview,
    deleteProjectTarget, projectDeletePreview, deleteProjectConfirmation, setDeleteProjectConfirmation,
    deleteWorkspaceTarget, workspaceDeletePreview, setWorkspaceDeletePreview,
    workspaceLifecycleError, deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation, copiedWorkspacePath,
    openArchiveWorkspaceDialog, closeArchiveWorkspaceDialog, confirmArchiveWorkspace,
    openDeleteProjectDialog, closeDeleteProjectDialog, confirmDeleteProject,
    openDeleteWorkspaceDialog, closeDeleteWorkspaceDialog, confirmDeleteWorkspace,
    copyWorkspacePath,
  } = useWorkspaceLifecycleDialogs({
    client, isBusy, setIsBusy, applyDesktopState, setSidebarActionError, setProjectMenuId, setWorkspaceMenuId,
    clearProjectOverview, clearProjectOverviewIfShowing,
  });
  const { collapsedProjectIds, setCollapsedProjectIds, collapsedWorkspaceIds, toggleWorkspaceCollapsed, loadSidebarDisclosure } = useSidebarDisclosure({
    clientScope, projects: desktopState.projects, workspaces: desktopState.workspaces,
  });
  const [projectOverviewId, setProjectOverviewId] = useState<string | null>(null);
  const { sidebarSortProps } = useSidebarSortOrder({ isBusy, persistSidebarOrder });
  const [sessionItems, setSessionItems] = useState<DisplayItem[]>([]);
  const [ephemeralBlocks, setEphemeralBlocksState] = useState<EphemeralDisplayBlock[]>([]);
  const ephemeralBlocksRef = useRef<EphemeralDisplayBlock[]>([]);
  function setEphemeralBlocks(update: EphemeralDisplayBlock[] | ((current: EphemeralDisplayBlock[]) => EphemeralDisplayBlock[])) {
    const next = typeof update === "function" ? update(ephemeralBlocksRef.current) : update;
    ephemeralBlocksRef.current = next;
    setEphemeralBlocksState(next);
  }
  const [optimisticPromptItems, setOptimisticPromptItems] = useState<DisplayItem[]>([]);
  // sessionCreated: the prompt now belongs to a created session, so only its delivery is uncertain.
  const [newPromptPreview, setNewPromptPreview] = useState<{ draftKey: string; item: DisplayItem; sessionCreated?: boolean } | null>(null);
  const promptAnchors = useRef(new Map<string, PromptTimelineAnchor>());
  const promptRetries = useRef(new Map<string, () => Promise<void>>());
  const promptRecovery = useRef(new Map<string, { restore: () => void; discard: () => void; release: () => void }>());
  const newPromptRecovery = useRef<{ restore: () => void; discard: () => void } | null>(null);
  const promptScope = useRef("");
  promptScope.current = `${clientScope}:${desktopState.selectedConversationId}`;
  const [sessionItemsLoading, setSessionItemsLoading] = useState(false);
  const [sessionItemsError, setSessionItemsError] = useState<string | null>(null);
  const [composerDrafts, setComposerDrafts] = useState<Record<string, ComposerDraft>>(() => restoredHostState?.composerDrafts ?? {});
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillMenuIndex, setSkillMenuIndex] = useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = useState(false);
  const composerDraftsRef = useRef(composerDrafts);
  composerDraftsRef.current = composerDrafts;
  const unreadConversationIds = useMemo(() => new Set(sessions.filter(session => session.read_state?.unread).map(session => session.id)), [sessions]);
  const readRequests = useRef(new Map<string, Promise<void>>());
  const manualUnread = useRef<{ id: string; version: number } | null>(null);
  const [conversationVisible, setConversationVisible] = useState(false);
  const [foreground, setForeground] = useState(() => !document.hidden && document.hasFocus());
  const [conversationContextMenu, setConversationContextMenu] = useState<ConversationContextMenu | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [isConversationAtBottom, setIsConversationAtBottom] = useState(true);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [defaultProfile, setDefaultProfile] = useState("");
  const [initialModelSelection] = useState(() => loadLastModelSelection(clientScope));
  const [draftProfile, setDraftProfile] = useState(initialModelSelection?.agent === "zotigo" ? initialModelSelection.profile : "");
  const { profileOverrides, setProfileOverrides, selectProfile } = useProfileOverrides({ client, setMessage, setIsBusy, setSessions, rememberModelSelection, refreshSessionItems });
  const { draftApprovalPolicy, approvalPolicyOverrides, setApprovalPolicyOverrides, selectApprovalPolicy } = useApprovalPolicySelection({ client, setMessage, setIsBusy, setSessions, refreshSessionItems, refreshSessions });
  const submittingApprovalIdsRef = useRef(new Set<string>());
  const submittingInteractionIdsRef = useRef(new Set<string>());
  const [submittingApprovalIds, setSubmittingApprovalIds] = useState<ReadonlySet<string>>(() => new Set());
  const [submittingInteractionIds, setSubmittingInteractionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [runtimeAgents, setRuntimeAgents] = useState<AgentCatalogEntry[]>([]);
  const [runtimeAgentsLoading, setRuntimeAgentsLoading] = useState(false);
  const [draftAgent, setDraftAgent] = useState<AgentKind>(initialModelSelection?.agent ?? "zotigo");
  const [draftCodexModel, setDraftCodexModel] = useState(initialModelSelection?.agent === "codex" ? initialModelSelection.model : "");
  const [draftCodexReasoningEffort, setDraftCodexReasoningEffort] = useState(initialModelSelection?.agent === "codex" ? initialModelSelection.reasoningEffort : "");
  const {
    isEditingConversationTitle, isSavingConversationTitle, conversationTitleDraft, setConversationTitleDraft,
    conversationTitleInputRef, renameDialogConversation, renameDialogTitleDraft, setRenameDialogTitleDraft,
    resetConversationTitleDraft, beginConversationTitleEdit, cancelConversationTitleEdit, saveConversationTitle,
    openRenameConversationDialog, closeRenameConversationDialog, submitRenameConversationDialog,
  } = useConversationTitleEditing({ conversations: desktopState.conversations, client, applyDesktopState, setMessage });
  const { renameDialogProject, renameDialogProjectNameDraft, setRenameDialogProjectNameDraft, isSavingProjectName, openRenameProjectDialog, closeRenameProjectDialog, submitRenameProjectDialog } = useRenameProjectDialog({ projects: desktopState.projects, client, applyDesktopState, setMessage, setProjectMenuId });
  const { renameDialogWorkspace, renameDialogWorkspaceTitleDraft, setRenameDialogWorkspaceTitleDraft, isSavingWorkspaceTitle, openRenameWorkspaceDialog, closeRenameWorkspaceDialog, submitRenameWorkspaceDialog } = useRenameWorkspaceDialog({ workspaces: desktopState.workspaces, client, applyDesktopState, setMessage, setWorkspaceMenuId });
  const { panels: sessionSidePanels, sidePanelTabs, setSidePanelTabs, sidePanelOpen, setSidePanelOpen,
    sidePanelExpanded, setSidePanelExpanded, directoryLocation, setDirectoryLocation, fileOpenInOtherSession,
  } = useSessionSidePanel(desktopState.selectedConversationId ?? "new", restoredHostState?.sessionSidePanels);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [sidePanelWidth, setSidePanelWidth] = useState(defaultSidePanelWidth);
  const [isSidePanelResizing, setIsSidePanelResizing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [treeVisible, setTreeVisible] = useState(false);
  const fileOpenRequest = useRef(0);
  const [fileOpening, setFileOpening] = useState(false);
  const [openFiles, setOpenFiles] = useState<Record<string, OpenFileState>>(() => normalizeHostFilesForRestore(restoredHostState?.openFiles ?? {}));
  const openFilesRef = useRef(openFiles);
  const hostSwitchingRef = useRef(false);
  const pendingUploadsRef = useRef(0);
  useEffect(() => {
    const beforeSwitch = (event: Event) => {
      if (pendingUploadsRef.current > 0) {
        toast(t("app.waitForAttachmentUploadsBeforeSwitchingHosts"), "info");
        event.preventDefault();
        return;
      }
      if (hostSwitchHasActiveSave(openFilesRef.current, filesSavingRef.current.size)) {
        window.alert(t("app.waitForTheCurrentFileSaveBeforeSwitching"));
        event.preventDefault();
        return;
      }
      hostSwitchingRef.current = true;
      for (const timer of fileSaveTimersRef.current.values()) window.clearTimeout(timer);
      fileSaveTimersRef.current.clear();
      const normalizedFiles = normalizeHostFilesForRestore(openFilesRef.current);
      openFilesRef.current = normalizedFiles;
      volatileStateByHost.set(clientScope, {
        ...volatileStateRef.current,
        openFiles: normalizedFiles,
      });
    };
    const switchCancelled = () => {
      hostSwitchingRef.current = false;
      for (const [filePath, file] of Object.entries(openFilesRef.current)) {
        if (file.saveStatus === "dirty") scheduleFileSave(filePath);
      }
    };
    window.addEventListener("zotigo:before-host-switch", beforeSwitch);
    const beforeUpdate = (event: Event) => {
      const states = [volatileStateRef.current, ...[...volatileStateByHost.entries()].filter(([host]) => host !== clientScope).map(([, state]) => state)];
      if (pendingUploadsRef.current > 0 || filesSavingRef.current.size > 0 || states.some(state =>
        Object.values(state.openFiles).some(file => file.kind === "text" && file.saveStatus !== "clean") ||
        Object.values(state.composerDrafts).some(draft => draft.prompt.length > 0 || draft.attachments.length > 0))) event.preventDefault();
    };
    window.addEventListener("zotigo:before-update", beforeUpdate);
    window.addEventListener("zotigo:host-switch-cancelled", switchCancelled);
    return () => {
      window.removeEventListener("zotigo:before-host-switch", beforeSwitch);
      window.removeEventListener("zotigo:before-update", beforeUpdate);
      window.removeEventListener("zotigo:host-switch-cancelled", switchCancelled);
    };
  }, [clientScope]);
  const fileSaveTimersRef = useRef<Map<string, number>>(new Map());
  const filesSavingRef = useRef<Set<string>>(new Set());
  const conversationScrollRef = useRef<HTMLDivElement | null>(null);
  const conversationScrollIntentRef = useRef<ConversationScrollIntent>(null);
  const conversationTouchYRef = useRef<number | null>(null);
  const appFrameRef = useRef<HTMLElement | null>(null);
  const sidePanelRef = useRef<HTMLElement | null>(null);
  const sidePanelRatioRef = useRef(defaultSidePanelRatio);
  const conversationAutoScrollFrameRef = useRef<number | null>(null);
  const sessionItemsPrevCursorRef = useRef<string | null>(null);
  const [sessionItemsLoadedForSessionId, setSessionItemsLoadedForSessionId] = useState<string | null>(null);
  const sessionHistoryCacheRef = useRef(new SessionHistoryCache());
  const switchTraceRef = useRef<ReturnType<typeof traceInteraction> | null>(null);
  useEffect(observeLongTasks, []);
  const sessionHistoryLoadRequestRef = useRef(0);
  const sessionHistoryBackfillRef = useRef<{ sessionId: string; historyRequestId: number } | null>(null);
  const sessionHistoryBackfillNeededRef = useRef<string | null>(null);
  const olderSessionItemsLoadingRef = useRef(false);
  const composerTextareaRef = useRef<SkillPromptEditorHandle | null>(null);
  const { forkConversation } = useForkConversation({ client, isBusy, setIsBusy, setMessage, composerTextareaRef, applyDesktopActionResult, selectConversation });
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const stickToBottomRef = useRef(true);
  const sessionItemsRef = useRef<DisplayItem[]>([]);
  const selectedSessionIdRef = useRef<string | null>(null);
  const streamPool = useRef<SessionStreamPool | null>(null);
  const [hostActivity, setHostActivity] = useState<ReadonlyMap<string, ActiveSessionState> | null>(null);
  const sidebarActionMenuRef = useRef<HTMLDivElement | null>(null);
  const navigationScrollRef = useRef<HTMLDivElement | null>(null);
  const lastCodexCatalogSyncAttemptAtRef = useRef(0);
  const desktopStateLoadedRef = useRef(false);
  const sessionQueryVersionRef = useRef<number | undefined>(undefined);
  const desktopStateGenerationRef = useRef(0);
  const lastCatalogRefreshAttemptAtRef = useRef(0);
  const codexCatalogSyncNotBeforeRef = useRef(Date.now() + initialCodexCatalogSyncDelayMs);
  const sessionRefreshesInFlightRef = useRef(0);
  const sessionRefreshRequestIdRef = useRef(0);
  const latestAppliedSessionRefreshIdRef = useRef(0);
  const pendingSessionDeltasRef = useRef<DisplayDelta[]>([]);
  const sessionDeltaFlushTimerRef = useRef<number | null>(null);
  const skillsRequestRef = useRef(0);
  openFilesRef.current = openFiles;
  const volatileStateRef = useRef<HostVolatileState>({
    desktopState,
    sessions,
    composerDrafts,
    openFiles,
    sessionSidePanels,
  });
  volatileStateRef.current = {
    desktopState,
    sessions,
    composerDrafts,
    openFiles,
    sessionSidePanels: Object.fromEntries(Object.entries(sessionSidePanels).map(([id, panel]) => [id, { ...panel, tabs: retainFileTabs(panel.tabs) }])),
  };

  useEffect(() => () => {
    if (volatileStateGenerationRef.current !== volatileStateGeneration) {
      revokeDraftAttachments(volatileStateRef.current.composerDrafts);
      return;
    }
    volatileStateByHost.set(clientScope, volatileStateRef.current);
  }, [clientScope]);

  useEffect(() => {
    for (const [filePath, file] of Object.entries(openFilesRef.current)) {
      if (file.saveStatus === "dirty") scheduleFileSave(filePath);
    }
    return () => {
      for (const timer of fileSaveTimersRef.current.values()) window.clearTimeout(timer);
      fileSaveTimersRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const frame = appFrameRef.current;
    const sidebar = frame?.querySelector<HTMLElement>(".sidebar");
    if (!frame || !sidebar) return;
    const resizeSidePanel = () => {
      const availableWidth = frame.getBoundingClientRect().width - sidebar.getBoundingClientRect().width;
      setSidePanelWidth(sidePanelWidthForRatio(sidePanelRatioRef.current, availableWidth));
    };
    resizeSidePanel();
    const observer = new ResizeObserver(resizeSidePanel);
    observer.observe(frame);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!projectMenuId && !workspaceMenuId) return;
    const closeSidebarMenus = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".project-row-actions, .workspace-row-actions")) {
        setProjectMenuId(null);
        setWorkspaceMenuId(null);
      }
    };
    document.addEventListener("pointerdown", closeSidebarMenus);
    return () => document.removeEventListener("pointerdown", closeSidebarMenus);
  }, [projectMenuId, workspaceMenuId]);

  useEffect(() => {
    if (!conversationContextMenu) return;
    const closeContextMenu = () => setConversationContextMenu(null);
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".session-context-menu")) closeContextMenu();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [conversationContextMenu]);

  useLayoutEffect(() => {
    const menu = sidebarActionMenuRef.current;
    const scroller = menu?.closest<HTMLElement>(".sidebar-default-navigation");
    const actions = menu?.parentElement;
    const anchor = actions?.querySelector<HTMLElement>('button[aria-expanded="true"]');
    if (!menu || !scroller || !anchor) {
      setSidebarActionMenuOpensUp(false);
      return;
    }
    const boundary = scroller.getBoundingClientRect();
    const anchorBounds = anchor.getBoundingClientRect();
    const roomBelow = boundary.bottom - anchorBounds.bottom;
    const roomAbove = anchorBounds.top - boundary.top;
    setSidebarActionMenuOpensUp(menu.offsetHeight > roomBelow && roomAbove > roomBelow);
  }, [projectMenuId, workspaceMenuId]);

  useLayoutEffect(() => {
    const scroller = navigationScrollRef.current;
    if (!scroller) return;
    let frame: number | null = null;
    const updateStickyRows = () => {
      frame = null;
      updateSidebarClipping(scroller);
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateStickyRows);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const observedSections = new Set<Element>();
    const observeSections = () => {
      const sections = new Set(scroller.querySelectorAll(".sidebar-section"));
      for (const section of observedSections) {
        if (!sections.has(section)) { resizeObserver.unobserve(section); observedSections.delete(section); }
      }
      for (const section of sections) {
        if (!observedSections.has(section)) { resizeObserver.observe(section); observedSections.add(section); }
      }
      scheduleUpdate();
    };
    const mutationObserver = new MutationObserver(observeSections);
    scroller.addEventListener("scroll", scheduleUpdate, { passive: true });
    resizeObserver.observe(scroller);
    mutationObserver.observe(scroller, { childList: true, subtree: true });
    observeSections();
    return () => {
      scroller.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const selectedProject = useMemo(
    () => desktopState.projects.find((project) => project.id === desktopState.selectedProjectId) ?? null,
    [desktopState.projects, desktopState.selectedProjectId],
  );
  const selectedConversation = useMemo(
    () =>
      desktopState.conversations.find((conversation) => conversation.id === desktopState.selectedConversationId) ??
      null,
    [desktopState.conversations, desktopState.selectedConversationId],
  );
  const contextMenuConversation = useMemo(
    () =>
      conversationContextMenu
        ? desktopState.conversations.find((conversation) => conversation.id === conversationContextMenu.conversationId) ??
          null
        : null,
    [conversationContextMenu, desktopState.conversations],
  );
  const selectedWorkspace = useMemo(
    () => desktopState.workspaces.find((workspace) => workspace.id === desktopState.selectedWorkspaceId) ?? null,
    [desktopState.selectedWorkspaceId, desktopState.workspaces],
  );
  const selectedBinding = useMemo(
    () =>
      selectedConversation
        ? desktopState.bindings.find((binding) => binding.conversation_id === selectedConversation.id) ?? null
        : null,
    [desktopState.bindings, selectedConversation],
  );
  const selectedSession = useMemo(() => {
    if (!selectedBinding) {
      return null;
    }
    return (
      sessions.find((session) => session.id === selectedBinding.daemon_session_id) ??
      sessionFromBinding(selectedBinding)
    );
  }, [selectedBinding, sessions]);
  const forkSourceBinding = desktopState.bindings.find((binding) => binding.daemon_session_id === selectedSession?.forked_from?.session_id);
  const forkSourceConversation = forkSourceBinding
    ? desktopState.conversations.find((conversation) => conversation.id === forkSourceBinding.conversation_id)
    : undefined;
  const savedModelFavorites = useSavedModelFavorites();
  const modelFavorites = { ...savedModelFavorites, select: selectModelFavorite };
  function selectModelFavorite(favorite: ModelFavorite) {
    if (selectedSession) {
      if (favorite.agent !== selectedAgent) return;
      if (favorite.agent === "codex") void selectSessionCodexSettings(favorite.model, favorite.reasoningEffort);
      else void selectProfile(selectedSession, selectedBinding, favorite.profile);
    } else {
      rememberModelSelection(favorite);
    }
  }
  const profileWorkspace = selectedConversation?.workspace_id
    ? desktopState.workspaces.find((workspace) => workspace.id === selectedConversation.workspace_id) ?? null
    : selectedWorkspace;
  const profileWorkingDirectory = selectedSession?.working_directory || profileWorkspace?.root_path;
  const selectedProfile = selectedSession
    ? profileOverrides[selectedSession.id] ?? selectedSession.profile ?? defaultProfile
    : draftProfile || defaultProfile;
  const selectedApprovalPolicy = selectedSession
    ? approvalPolicyOverrides[selectedSession.id] ?? selectedSession.approval_policy ?? null
    : draftApprovalPolicy;
  const selectedAgent = selectedSession?.agent ?? (selectedSession ? "zotigo" : draftAgent);
  const codexAgent = runtimeAgents.find((agent) => agent.id === "codex");
  const codexModels = codexAgent?.models ?? [];
  const selectedCodexModel = selectedSession?.model ?? draftCodexModel;
  const selectedCodexReasoningEffort = selectedSession?.reasoning_effort ?? draftCodexReasoningEffort;
  const pinnedItems = useMemo(() => (desktopState.pinnedItems ?? desktopState.conversations
    .filter((conversation) => conversation.pinned_at)
    .sort((left, right) => (left.pinned_order ?? 0) - (right.pinned_order ?? 0))
    .map((conversation): NavigationItem => ({ kind: "session", id: conversation.id })))
    .filter((item) => (item.kind === "project" ? desktopState.projects : item.kind === "workspace" ? desktopState.workspaces : desktopState.conversations).some((candidate) => candidate.id === item.id)), [desktopState]);
  const navigationKey = (item: NavigationItem) => `${item.kind}:${item.id}`;
  const pinnedKeys = pinnedItems.map(navigationKey);
  const isNavigationPinned = (kind: NavigationItem["kind"], id: string) => pinnedItems.some((item) => item.kind === kind && item.id === id);
  useEffect(() => {
    if (!surfaceActive || repositoriesOpen || channelsOpen) navigationRevision.current++;
  }, [surfaceActive, repositoriesOpen, channelsOpen]);
  const reveal = surfaceActive && !recentSessionsOpen && !repositoriesOpen && !channelsOpen && !projectOverviewId && searchTarget && (searchTarget.kind === "session"
    ? selectedConversation?.id === searchTarget.id
    : !selectedConversation && selectedWorkspace?.id === searchTarget.id) ? searchTarget : null;
  const revealSessionPinned = reveal?.kind === "session" && isNavigationPinned("session", reveal.id);
  const revealWorkspaceId = reveal && !revealSessionPinned ? selectedWorkspace?.id : undefined;
  const revealWorkspacePinned = !!revealWorkspaceId && isNavigationPinned("workspace", revealWorkspaceId);
  const revealProjectId = revealWorkspaceId && !revealWorkspacePinned ? selectedWorkspace?.project_id : undefined;
  const revealSection = !reveal ? undefined : revealSessionPinned || revealWorkspacePinned || (revealProjectId && isNavigationPinned("project", revealProjectId))
    ? "pinned" : revealWorkspaceId ? "projects" : "ungrouped";
  useEffect(() => {
    if (searchTarget && !reveal) setSearchTarget(null);
  }, [searchTarget, reveal]);
  useEffect(() => {
    const navigation = navigationScrollRef.current;
    if (!reveal || !navigation) return;
    const selector = reveal.kind === "session" ? `[data-session-id="${CSS.escape(reveal.id)}"]` : `[data-workspace-id="${CSS.escape(reveal.id)}"] .workspace-row`;
    let cancelled = false;
    let stopFollowing = () => {};
    const frame = requestAnimationFrame(() => {
      const scroll = () => {
        const row = navigation.querySelector(selector);
        if (!row) return;
        // Stop below the sticky section, project and workspace rows that stay
        // pinned above the target; otherwise they cover it.
        const covered = stickyHeaderHeight(row, navigation);
        const top = navigation.scrollTop + row.getBoundingClientRect().top - navigation.getBoundingClientRect().top - covered;
        // Give even the final row enough room to reach the top of the sidebar.
        const lastSection = navigation.lastElementChild;
        const remaining = (lastSection?.getBoundingClientRect().bottom ?? 0) - row.getBoundingClientRect().top;
        navigation.style.setProperty("--search-reveal-space", `${Math.max(0, Math.ceil(navigation.clientHeight - covered - remaining))}px`);
        navigation.scrollTop = top;
      };
      scroll();
      // The target can still move after the first scroll: adjacent branches
      // finish closing and scrolling loads further sidebar pages above it.
      // Follow it until the layout settles or the user scrolls. Sections
      // mounted later, or pages slower than this window, are not followed.
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => { if (!cancelled) scroll(); });
      for (const section of navigation.children) observer.observe(section);
      stopFollowing = () => {
        observer.disconnect();
        window.clearTimeout(timer);
        for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) navigation.removeEventListener(type, stopFollowing);
      };
      const timer = window.setTimeout(stopFollowing, 1500);
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) navigation.addEventListener(type, stopFollowing, { passive: true });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stopFollowing();
      navigation.style.removeProperty("--search-reveal-space");
    };
  }, [reveal]);
  const actionableSessionItems = useMemo(
    () => authoritativeSessionItems(
      sessionItems,
      selectedBinding?.daemon_session_id,
      sessionItemsLoadedForSessionId,
    ),
    [selectedBinding?.daemon_session_id, sessionItems, sessionItemsLoadedForSessionId],
  );
  const selectedActiveTurn = useMemo(() => latestActiveTurn(actionableSessionItems), [actionableSessionItems]);
  const selectedActivity = useMemo(
    () => selectedTimelineActivity({
      conversationId: selectedConversation?.id,
      sessionId: selectedBinding?.daemon_session_id,
      loadedSessionId: sessionItemsLoadedForSessionId,
      sessionState: selectedSession?.state,
      loading: sessionItemsLoading,
      hasActiveTurn: selectedActiveTurn !== null,
    }),
    [
      selectedActiveTurn,
      selectedBinding?.daemon_session_id,
      selectedConversation?.id,
      selectedSession?.state,
      sessionItemsLoading,
      sessionItemsLoadedForSessionId,
    ],
  );
  const workingConversationIds = useMemo(
    () => workingConversationIdsForSessions(desktopState.bindings, sessions, selectedActivity, hostActivity),
    [desktopState.bindings, selectedActivity, sessions, hostActivity],
  );
  const composerDraftKey = draftKeyForSelection({
    conversationId: selectedConversation?.id ?? null,
    projectId: desktopState.selectedProjectId,
    workspaceId: desktopState.selectedWorkspaceId,
  });
  const [searchWindow, setSearchWindow] = useState<DisplayItem[] | null>(null);
  const searchWindowRequest = useRef(0);
  const conversationFindOpen = useRef(false);
  useEffect(() => { searchWindowRequest.current++; setSearchWindow(null); }, [composerDraftKey]);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  useEffect(() => { setEditingReferenceId(null); }, [composerDraftKey, surfaceActive]);
  const activeComposerDraft = composerDrafts[composerDraftKey] ?? emptyComposerDraft<ComposerAttachment>();
  const activePrompt = activeComposerDraft.prompt;
  const composerAttachments = activeComposerDraft.attachments;
  const selectedSkillNames = activeComposerDraft.selectedSkillNames;
  // Once the created session's own user_message arrives, the timeline shows the prompt instead.
  const showNewPromptPreview = newPromptPreview?.draftKey === composerDraftKey && !(newPromptPreview.sessionCreated
    && newPromptPreview.item.delivery?.state !== "failed" && newPromptPreview.item.delivery?.state !== "rejected"
    && sessionItems.some(item => item.type === "user_message"));

  useEffect(() => {
    const updateVisibility = () => setConversationVisible(conversationIsVisible(conversationScrollRef.current));
    updateVisibility();
    window.addEventListener("resize", updateVisibility);
    return () => window.removeEventListener("resize", updateVisibility);
  }, [sidePanelOpen, sidePanelExpanded, channelsOpen, channelsSessionVisible, repositoriesOpen, webNavigationOpen, selectedConversation?.id]);

  useEffect(() => { manualUnread.current = null; }, [selectedConversation?.id]);

  useEffect(() => {
    const session = selectedSession;
    if (!session || readRequests.current.has(session.id)) return;
    if (manualUnread.current?.id === session.id && manualUnread.current.version === session.read_state?.version) return;
    const visibleSequence = sessionItems.reduce((latest, item) => Math.max(latest, item.sequence), 0);
    if (canAcknowledgeSession(session.read_state, visibleSequence,
      foreground && surfaceActive && conversationIsVisible(conversationScrollRef.current)
      && isConversationAtBottom && !searchWindow && !sessionItemsError
      && sessionItemsLoadedForSessionId === session.id)) markConversationRead(session.id);
  }, [selectedSession, sessionItems, sessionItemsLoadedForSessionId, foreground, surfaceActive, conversationVisible, isConversationAtBottom, searchWindow, sessionItemsError]);

  async function persistSidebarOrder(kind: SidebarDragItem["kind"], scopeId: string, orderedIds: string[]) {
    try {
      const state = kind === "project"
        ? await client.reorderProjects(orderedIds)
        : kind === "workspace"
          ? await client.reorderWorkspaces(scopeId, orderedIds)
          : kind === "workspace-session"
            ? await client.reorderWorkspaceConversations(orderedIds)
            : await client.reorderPinnedItems(orderedIds.map((key) => {
              const item = pinnedItems.find((candidate) => navigationKey(candidate) === key);
              if (!item) throw new Error(t("app.pinnedItemIsNoLongerAvailable"));
              return item;
            }));
      applyDesktopState(state);
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    }
  }
  const visibleWorkspaces = useVisibleWorkspaces(navigationScrollRef, `${revealWorkspaceId ?? ""}:${recentSessionsOpen}:${desktopState.workspaces.map(item => item.id).join(",")}:${[...collapsedProjectIds].join(",")}:${[...collapsedWorkspaceIds].join(",")}`);
  const pagedNavigation = useSessionPages({ client, enabled: desktopState.sessionQueryVersion === 1,
    workingSessionIds: hostActivity?.keys() ?? sessions.filter(session => session.working && sessionAllowsActiveTurn(session.state)).map(session => session.id),
    activity: recentSessionsOpen && !channelsOpen && !repositoriesOpen, channel: activityChannelMode,
    workspaces: desktopState.workspaces.filter(workspace => visibleWorkspaces.has(workspace.id) && (!collapsedWorkspaceIds.has(workspace.id) || revealWorkspaceId === workspace.id) && (!collapsedProjectIds.has(workspace.project_id) || revealProjectId === workspace.project_id || isNavigationPinned("workspace", workspace.id))).map(workspace => workspace.id),
    active: surfaceActive && !channelsOpen && !repositoriesOpen,
    onConnection: online => setConnectionState(online ? "online" : "offline"),
    onPage: page => {
      setDesktopState(current => mergeSessionPage(current, page));
      mergeLoadedSessions(page.sessions);
    },
  });
  const ungroupedConversations = useMemo(
    () => desktopState.conversations.filter((conversation) => conversation.workspace_id === null && !conversation.pinned_at && (desktopState.sessionQueryVersion !== 1 || !pagedNavigation.ids("ungrouped") || pagedNavigation.ids("ungrouped")!.includes(conversation.id) || conversation.id === desktopState.selectedConversationId)),
    [desktopState, pagedNavigation],
  );
  const selectedActiveTurnId = selectedActiveTurn?.turn?.id ?? null;
  const hasActiveTurn = sessionAllowsActiveTurn(selectedSession?.state) && selectedActiveTurn !== null;
  const timelineItems = useMemo(
    () => orderDisplayInputs(anchorPromptTimeline([
      ...sessionItems,
      ...ephemeralDisplayItems(ephemeralBlocks),
      ...reconcileOptimisticSteering(optimisticPromptItems.filter(item => !item.queuedPreview), sessionItems),
    ], promptAnchors.current)),
    [ephemeralBlocks, optimisticPromptItems, sessionItems],
  );
  const streamingItemIds = useMemo(
    () => new Set(ephemeralBlocks.map((block) => block.id)),
    [ephemeralBlocks],
  );
  const subagentRuns = useMemo(() => buildSubagentRuns(timelineItems), [timelineItems]);
  const subagentRunIdKey = subagentRuns.map((run) => run.id).join("\n");
  const subagentNavigation = useMemo<SubagentNavigationValue>(() => {
    const ids = new Set(subagentRunIdKey.split("\n"));
    return { has: (id) => ids.has(id), open: (id) => showPanelTab(subagentSidePanelTab(id)) };
  }, [subagentRunIdKey]);
  const previewAttachment = useMemo(
    () => composerAttachments.find((attachment) => attachment.id === previewAttachmentId) ?? null,
    [composerAttachments, previewAttachmentId],
  );
  const [promptCaret, setPromptCaret] = useState<number | null>(null);
  const activeSkillCommand = skillCommandQuery(activePrompt.slice(0, promptCaret ?? activePrompt.length));
  const skillMatches = useMemo(
    () => matchingSkills(availableSkills, activeSkillCommand?.query ?? "")
      .filter((skill) => skill.enabled),
    [activeSkillCommand?.query, availableSkills, selectedSkillNames],
  );
  const skillMenuOpen = activeSkillCommand !== null && !skillMenuDismissed;
  const hasComposerDraft = activePrompt.trim() !== "" || composerAttachments.length > 0 || Boolean(activeComposerDraft.references?.length);
  const runtimeOccupied = selectedSession?.error_code === "runtime_occupied";
  const attachmentsBlocked = composerAttachments.some(file => file.upload?.state === "uploading" || file.upload?.state === "failed");
  const canSubmitSelectedPrompt = Boolean(selectedConversation && !runtimeOccupied && !isBusy && !attachmentsBlocked && hasComposerDraft);
  const showStopControl = Boolean(
    selectedSession?.state === "running" && selectedActiveTurnId && !hasComposerDraft && !isBusy,
  );
  sessionItemsRef.current = sessionItems;
  selectedSessionIdRef.current = selectedBinding?.daemon_session_id ?? null;

  useEffect(() => {
    resetConversationTitleDraft(selectedConversation?.title ?? "");
  }, [composerDraftKey]);

  useEffect(() => {
    setPauseRequestedTurnId(null);
    fileOpenRequest.current++;
    setFileOpening(false);

    setAvailableSkills([]);
    setSkillsError(null);
    setSkillMenuDismissed(false);
    // Let navigation/search restore their focus first, then focus the new draft
    // without scrolling the conversation or repeating on streamed updates.
    const focusFrame = window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [composerDraftKey]);

  useEffect(() => {
    setSkillMenuIndex(0);
  }, [activeSkillCommand?.query]);

  useEffect(() => {
    if (!skillMenuOpen) return;
    const requestId = ++skillsRequestRef.current;
    setSkillsLoading(true);
    setSkillsError(null);
    void client.listSkills(selectedBinding?.daemon_session_id, true)
      .then((response) => {
        if (requestId !== skillsRequestRef.current) return;
        setAvailableSkills(response.skills);
      })
      .catch((error: unknown) => {
        if (requestId !== skillsRequestRef.current) return;
        setAvailableSkills([]);
        setSkillsError(errorMessage(error));
      })
      .finally(() => {
        if (requestId === skillsRequestRef.current) setSkillsLoading(false);
      });
  }, [daemonUrl, selectedBinding?.daemon_session_id, skillMenuOpen]);

  useEffect(() => {
    if (pauseRequestedTurnId && pauseRequestedTurnId !== selectedActiveTurnId) {
      setPauseRequestedTurnId(null);
    }
  }, [pauseRequestedTurnId, selectedActiveTurnId]);

  useEffect(() => {
    let isMounted = true;
    const initialDesktopGeneration = desktopStateGenerationRef.current;

    Promise.all([
      client.getDaemonConfig(),
      openNewSessionOnMount ? client.selectProject(null) : client.getDesktopState(),
    ])
      .then(([config, state]) => {
        if (!isMounted) {
          return;
        }
        setDaemonUrl(config.baseUrl);
        // Cached rows are interactive before this request returns. A delayed
        // initial snapshot must not undo a newer selection or catalog mutation.
        if (catalogSnapshotIsCurrent(initialDesktopGeneration, desktopStateGenerationRef.current)) setDesktopState(current => mergeCatalogStructure(current, state));
        sessionQueryVersionRef.current = state.sessionQueryVersion;
        onSessionQuerySupport?.(state.sessionQueryVersion === 1);
        lastCatalogRefreshAttemptAtRef.current = Date.now();
        loadSidebarDisclosure(
          state.projects.map((project) => project.id),
          state.workspaces.map((workspace) => workspace.id),
        );
        desktopStateLoadedRef.current = true;
        codexCatalogSyncNotBeforeRef.current = Date.now() + initialCodexCatalogSyncDelayMs;
        void refreshSessions({ quiet: true });
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setConnectionState("offline");
          setMessage(errorMessage(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || !desktopStateLoadedRef.current || sessionRefreshesInFlightRef.current > 0) return;
      const now = Date.now();
      void refreshSessions({
        quiet: true,
        syncCodex: scheduledCatalogSyncDue({
          desktopStateLoaded: desktopStateLoadedRef.current,
          nowMs: now,
          notBeforeMs: codexCatalogSyncNotBeforeRef.current,
          lastAttemptAtMs: lastCodexCatalogSyncAttemptAtRef.current,
          intervalMs: codexCatalogSyncIntervalMs,
        }),
      });
    }, pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [selectedBinding?.daemon_session_id, sessionItemsLoadedForSessionId, desktopState.sessionQueryVersion]);

  useEffect(() => {
    // Fetch usage on selection rather than waiting for the polling interval.
    if (selectedBinding) void refreshSessions({ quiet: true });
  }, [selectedBinding?.daemon_session_id]);

  useEffect(() => {
    let live = true;
    const pool = new SessionStreamPool({
      subscribe(id) {
        const items = id ? cachedSessionHistory(id)?.items : undefined;
        const after = items?.at(-1)?.sequence;
        void client.subscribeSessionEvents(id, after).catch(() => {
          if (live) pool.receive({session_id: id, status: "unsupported"});
        });
      },
      unsubscribe(id) { void client.unsubscribeSessionEvents(id).catch(() => {}); },
      activity: setHostActivity,
      async catchUp(id, signal) {
        if (!cachedSessionHistory(id) && selectedSessionIdRef.current !== id) return;
        await loadHistoryTail(id, () => live && !signal.aborted && (selectedSessionIdRef.current === id || Boolean(cachedSessionHistory(id))));
      },
    });
    streamPool.current = pool;
    const remove = client.onSessionEvent(envelope => {
      pool.receive(envelope);
      const id = envelope.session_id;
      if (id && id !== selectedSessionIdRef.current && pool.tracks(id) && envelope.event?.type === "item" && cachedSessionHistory(id)) {
        mergeCachedSessionHistory(id, [envelope.event.item]);
      }
    });
    pool.start();
    return () => { live = false; remove(); pool.dispose(); streamPool.current = null; };
  }, [client]);

  useEffect(() => {
    const historyRequestId = ++sessionHistoryLoadRequestRef.current;
    clearPendingSessionDeltas();
    sessionHistoryBackfillNeededRef.current = null;
    setSessionItemsLoadedForSessionId(null);
    olderSessionItemsLoadingRef.current = false;
    setEphemeralBlocks([]);
    setOptimisticPromptItems([]);
    promptAnchors.current.clear();
    promptRetries.current.clear();
    promptRecovery.current.forEach(recovery => recovery.release());
    promptRecovery.current.clear();
    setSessionItemsError(null);
    if (!selectedBinding) {
      sessionHistoryCacheRef.current.activate(null);
      sessionItemsPrevCursorRef.current = null;
      sessionItemsRef.current = [];
      setSessionItems([]);
      setSessionItemsLoading(false);
      streamPool.current?.select(null);
      return;
    }

    let active = true;
    const sessionId = selectedBinding.daemon_session_id;
    sessionHistoryCacheRef.current.activate(sessionId);
    const cachedHistory = cachedSessionHistory(sessionId);
    sessionItemsPrevCursorRef.current = cachedHistory?.prevCursor ?? null;
    sessionItemsRef.current = cachedHistory?.items ?? [];
    setSessionItems(cachedHistory?.items ?? []);
    setSessionItemsLoading(!cachedHistory);
    let readyForDeltas = false;
    const removeListener = client.onSessionEvent((envelope) => {
      if (!active || envelope.session_id !== sessionId) {
        return;
      }
      if (envelope.status === "reconnecting" || envelope.status === "unsupported") {
        clearPendingSessionDeltas();
        setEphemeralBlocks([]);
      }
      const sessionEvent = envelope.event;
      if (readyForDeltas && sessionEvent?.type === "delta") {
        queueSessionDelta(sessionEvent.delta);
      }
      if (readyForDeltas && sessionEvent?.type === "item") {
        acceptDurableItems(sessionId, [sessionEvent.item]);
      }
    });

    void refreshSessionItems(selectedBinding, { historyRequestId, quiet: Boolean(cachedHistory) }).then(() => {
      if (!active) return;
      readyForDeltas = true;
      streamPool.current?.select(sessionId);
    });

    return () => {
      active = false;
      if (sessionHistoryLoadRequestRef.current === historyRequestId) {
        sessionHistoryLoadRequestRef.current += 1;
      }
      clearPendingSessionDeltas();
      removeListener();
      streamPool.current?.select(null);
    };
  }, [selectedBinding?.daemon_session_id]);

  useLayoutEffect(() => {
    setPreviewAttachmentId(null);
    cancelScheduledConversationAutoScroll();
    conversationScrollIntentRef.current = null;
    setStickToBottom(true);
    scheduleConversationScrollToBottom();
  }, [composerDraftKey]);

  useLayoutEffect(() => {
    const scrollElement = conversationScrollRef.current;
    const bodyElement = scrollElement?.querySelector<HTMLElement>(".conversation-body");
    if (!bodyElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) scheduleConversationScrollToBottom();
    });
    observer.observe(bodyElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => cancelScheduledConversationAutoScroll(), []);
  useEffect(() => {
    let active = true;
    setProfilesLoading(true);
    client
      .getProfiles(profileWorkingDirectory, profileWorkingDirectory ? undefined : "global")
      .then((response) => {
        if (!active) return;
        setProfiles(response.profiles);
        setDefaultProfile(response.default_profile);
        setDraftProfile((current) =>
          response.profiles.some((profile) => profile.name === current) ? current : response.default_profile,
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setProfiles([]);
          setDefaultProfile("");
          setMessage(errorMessage(error));
        }
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profileWorkingDirectory, daemonUrl, surfaceActive]);

  useEffect(() => {
    let active = true;

    setRuntimeAgentsLoading(true);
    client.getAgents()
      .then(async (catalog) => {
        const nativeAgent = catalog.agents.find((agent) => agent.id === "zotigo");
        const installedCodex = catalog.agents.find((agent) => agent.id === "codex" && agent.availability !== "unavailable");
        let preparedCodex: AgentCatalogEntry | undefined;
        if (installedCodex || refreshedCodex) {
          try {
            preparedCodex = refreshedCodex ?? await client.prepareCodex();
          } catch {
            preparedCodex = undefined;
          }
        }
        if (!active) return;
        const availableAgents = [nativeAgent, preparedCodex].filter((agent): agent is AgentCatalogEntry => Boolean(agent));
        setRuntimeAgents(availableAgents);
        const models = preparedCodex?.models ?? [];
        const defaultModel = models.find((model) => model.id === draftCodexModel)
          ?? models.find((model) => initialModelSelection?.agent === "codex" && model.id === initialModelSelection.model)
          ?? models.find((model) => model.is_default) ?? models[0];
        setDraftCodexModel((current) => models.some((model) => model.id === current) ? current : defaultModel?.id ?? "");
        setDraftCodexReasoningEffort((current) => {
          const efforts = defaultModel?.supported_reasoning_efforts ?? [];
          return compatibleReasoningEffort(efforts, current);
        });
        setDraftAgent((current) => availableAgents.some((agent) => agent.id === current)
          ? current
          : catalog.default_agent === "codex" && preparedCodex ? "codex" : "zotigo");
      })
      .catch(() => {
        if (active) setRuntimeAgents([]);
      })
      .finally(() => {
        if (active) setRuntimeAgentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [daemonUrl, refreshedCodex]);

  const markdownImageContext = useMemo(() => ({
    sessionId: selectedSession?.id,
    basePath: selectedSession?.working_directory ?? selectedWorkspace?.root_path ?? null,
    baseKind: "directory" as const,
  }), [selectedSession?.id, selectedSession?.working_directory, selectedWorkspace?.root_path]);

  const timelineActions = useTimelineActions({
    onFork: (turnId) => {
      if (selectedConversation) void forkConversation(selectedConversation.id, turnId);
    },
    onOpenForkSource: forkSourceConversation ? () => selectConversation(forkSourceConversation.id) : undefined,
  });

  useEffect(() => {
    const updateAnimationState = () => {
      setForeground(!document.hidden && document.hasFocus());
      document.documentElement.classList.toggle(
        "animations-paused",
        document.hidden || !document.hasFocus(),
      );
    };
    updateAnimationState();
    document.addEventListener("visibilitychange", updateAnimationState);
    window.addEventListener("focus", updateAnimationState);
    window.addEventListener("blur", updateAnimationState);
    return () => {
      document.removeEventListener("visibilitychange", updateAnimationState);
      window.removeEventListener("focus", updateAnimationState);
      window.removeEventListener("blur", updateAnimationState);
    };
  }, []);

  useEffect(() => {
    if (!runtimeOccupied || !selectedConversation) {
      return;
    }
    const retryWhenFocused = () => void retryRuntimeOccupiedSession();
    window.addEventListener("focus", retryWhenFocused);
    return () => window.removeEventListener("focus", retryWhenFocused);
  }, [runtimeOccupied, selectedConversation?.id, isBusy]);

  useEffect(() => {
    if (!selectedConversation || !stickToBottomRef.current) {
      return;
    }
    scheduleConversationScrollToBottom();
  }, [message, selectedConversation, timelineItems, sessionItemsLoading]);

  function applyDesktopState(update: SetStateAction<DesktopState>) {
    desktopStateGenerationRef.current += 1;
    lastCatalogRefreshAttemptAtRef.current = Date.now();
    setDesktopState(current => typeof update === "function" ? update(current) : mergeCatalogStructure(current, update));
  }

  function mergeLoadedSessions(loaded: ZotigoSession[]) {
    setSessions(current => { const ids = new Set(loaded.map(session => session.id)); return mergeSessionReadStates(current, retainSessionContextUsage(current, [...current.filter(session => !ids.has(session.id)), ...loaded])); });
  }

  function cachedSessionHistory(sessionId: string): SessionHistory | null {
    return sessionHistoryCacheRef.current.get(sessionId) ?? null;
  }

  function mergeCachedSessionHistory(
    sessionId: string,
    items: DisplayItem[],
    prevCursor?: string | null,
  ): DisplayItem[] {
    const cached = sessionHistoryCacheRef.current.get(sessionId);
    const merged = mergeDisplayItems(cached?.items ?? [], items);
    if (selectedSessionIdRef.current === sessionId) {
      for (const item of items) promptAnchors.current.delete(item.id);
    }
    const entry = {
      items: merged,
      prevCursor: prevCursor === undefined ? cached?.prevCursor ?? null : prevCursor,
    };
    sessionHistoryCacheRef.current.set(sessionId, entry);
    if (selectedSessionIdRef.current === sessionId) {
      sessionItemsRef.current = merged;
      setSessionItems(merged);
    }
    return merged;
  }

  useEffect(() => {
    if (catalogSyncRevision > 0) void refreshSessions({ quiet: true, refreshCatalog: true });
  }, [catalogSyncRevision]);

  async function refreshSessions(options: { quiet?: boolean; syncCodex?: boolean; refreshCatalog?: boolean } = {}): Promise<void> {
    if (desktopState.sessionQueryVersion === 1 && !options.quiet) pagedNavigation.refresh();
    const requestId = ++sessionRefreshRequestIdRef.current;
    const desktopStateGeneration = desktopStateGenerationRef.current;
    sessionRefreshesInFlightRef.current += 1;
    if (!options.quiet) {
      setIsBusy(true);
      setMessage(null);
    }

    try {
      const shouldRefreshCatalog = catalogRefreshDue({
        syncRequested: options.syncCodex === true || options.refreshCatalog === true,
        desktopStateLoaded: desktopStateLoadedRef.current,
        nowMs: Date.now(),
        lastAttemptAtMs: lastCatalogRefreshAttemptAtRef.current,
        intervalMs: catalogReconciliationIntervalMs,
      });
      if (options.syncCodex) lastCodexCatalogSyncAttemptAtRef.current = Date.now();
      if (shouldRefreshCatalog) lastCatalogRefreshAttemptAtRef.current = Date.now();
      let catalogError: unknown;
      let detailError: unknown;
      const desktopStatePromise = shouldRefreshCatalog
        ? options.syncCodex && client.syncDesktopState
          ? client.syncDesktopState().catch((error: unknown) => {
              catalogError = error;
              return null;
            })
          : client.getDesktopState().catch((error: unknown) => {
              catalogError = error;
              return null;
            })
        : Promise.resolve(null);
      const [listedSessions, nextDesktopState, selectedSessionDetail] = await Promise.all([
        sessionQueryVersionRef.current === 1 ? Promise.resolve([]) : client.listSessions(),
        desktopStatePromise,
        selectedBinding ? client.getSession(selectedBinding.daemon_session_id).catch((error: unknown) => { detailError = error; return null; }) : Promise.resolve(null),
      ]);
      const nextSessions = selectedSessionDetail ? upsertSession(listedSessions, selectedSessionDetail) : listedSessions;
      if (requestId < latestAppliedSessionRefreshIdRef.current) {
        return;
      }
      latestAppliedSessionRefreshIdRef.current = requestId;
      if (catalogError || detailError) setConnectionState("offline");
      else if (nextDesktopState || selectedSessionDetail || sessionQueryVersionRef.current !== 1) setConnectionState("online");
      if (!desktopStateLoadedRef.current) {
        desktopStateLoadedRef.current = true;
        codexCatalogSyncNotBeforeRef.current = Date.now() + initialCodexCatalogSyncDelayMs;
      }
      if (nextDesktopState) { sessionQueryVersionRef.current = nextDesktopState.sessionQueryVersion; onSessionQuerySupport?.(nextDesktopState.sessionQueryVersion === 1); }
      if (nextDesktopState && catalogSnapshotIsCurrent(desktopStateGeneration, desktopStateGenerationRef.current)) {
        setDesktopState((current) => sameJsonValue(current, nextDesktopState) ? current : mergeCatalogStructure(current, nextDesktopState));
      }
      setSessions((current) => {
        const scopedSessions = sessionQueryVersionRef.current === 1 ? (selectedSessionDetail ? upsertSession(current, selectedSessionDetail) : current) : nextSessions;
        const merged = mergeSessionReadStates(current, retainSessionContextUsage(current, scopedSessions, selectedSessionDetail?.id));
        return sameJsonValue(current, merged) ? current : merged;
      });
      setApprovalPolicyOverrides((current) => clearResolvedApprovalPolicyOverrides(current, nextSessions));
      if (catalogError && !options.quiet) setMessage(errorMessage(catalogError));
      if (selectedBinding && selectedSessionItemsNeedRefresh(
        selectedBinding.daemon_session_id,
        sessionItemsLoadedForSessionId,
        (streamPool.current?.upToDate(selectedBinding.daemon_session_id) ?? false)
          && (selectedSessionDetail?.latest_item_sequence ?? selectedSessionDetail?.read_state?.completed_sequence ?? 0) <= (sessionItemsRef.current.at(-1)?.sequence ?? 0),
        sessionHistoryBackfillNeededRef.current === selectedBinding.daemon_session_id,
      )) {
        await refreshSessionItems(selectedBinding, { quiet: true });
      }
    } catch (error) {
      if (requestId >= latestAppliedSessionRefreshIdRef.current) {
        setConnectionState("offline");
        if (!options.quiet) {
          setMessage(errorMessage(error));
        }
      }
    } finally {
      sessionRefreshesInFlightRef.current -= 1;
      if (!options.quiet) {
        setIsBusy(false);
      }
    }
  }

  function queueSessionDelta(delta: DisplayDelta) {
    pendingSessionDeltasRef.current.push(delta);
    if (sessionDeltaFlushTimerRef.current !== null) return;
    sessionDeltaFlushTimerRef.current = window.setTimeout(
      flushPendingSessionDeltas,
      sessionDeltaFlushIntervalMs,
    );
  }

  function flushPendingSessionDeltas() {
    if (sessionDeltaFlushTimerRef.current !== null) {
      window.clearTimeout(sessionDeltaFlushTimerRef.current);
      sessionDeltaFlushTimerRef.current = null;
    }
    const pending = pendingSessionDeltasRef.current;
    if (pending.length === 0) return;
    pendingSessionDeltasRef.current = [];
    setEphemeralBlocks((current) =>
      appendDisplayDeltas(current, pending, sessionItemsRef.current),
    );
  }

  function clearPendingSessionDeltas() {
    if (sessionDeltaFlushTimerRef.current !== null) {
      window.clearTimeout(sessionDeltaFlushTimerRef.current);
      sessionDeltaFlushTimerRef.current = null;
    }
    pendingSessionDeltasRef.current = [];
  }

  async function loadHistoryTail(sessionId: string, current: () => boolean): Promise<number> {
    let count = 0;
    const cached = cachedSessionHistory(sessionId);
    await readSessionHistoryTail(cached ? cached.items.at(-1)?.sequence ?? 0 : undefined,
      query => client.listSessionItems(sessionId, query), current, (page, initial) => {
        count += page.items.length;
        if (page.items.length || initial) {
          acceptDurableItems(sessionId, page.items, initial ? page.prev_cursor || null : undefined);
        }
      });
    return count;
  }

  // SSE and recovery pages acknowledge the same durable log items. Apply the
  // same preview retirement and optimistic delivery effects on either path.
  function acceptDurableItems(sessionId: string, items: DisplayItem[], prevCursor?: string | null) {
    const selected = selectedSessionIdRef.current === sessionId;
    if (selected) flushPendingSessionDeltas();
    const merged = mergeCachedSessionHistory(sessionId, items, prevCursor);
    if (!selected) return;
    if (prevCursor !== undefined) sessionItemsPrevCursorRef.current = prevCursor;
    if (items.some(item => item.type === "model_usage_updated" && item.context_usage)) {
      let usage: DisplayItem["context_usage"];
      for (let index = merged.length - 1; index >= 0 && !usage; index--) {
        if (merged[index].type === "model_usage_updated") usage = merged[index].context_usage;
      }
      if (usage) setSessions(current => current.map(session => session.id === sessionId ? { ...session, context_usage: usage } : session));
    }
    setEphemeralBlocks(current => items.reduce(reconcileDisplayPreviews, current));
    for (const item of items) {
      promptRetries.current.delete(item.id);
      promptRecovery.current.get(item.id)?.release();
      promptRecovery.current.delete(item.id);
    }
    setOptimisticPromptItems(current => reconcileOptimisticSteering(current, items));
    applyDurableItemEffects(sessionId, items);
  }

  async function refreshSessionItems(
    binding: DaemonSessionBinding,
    options: { quiet?: boolean; historyRequestId?: number } = {},
  ): Promise<DisplayItem[]> {
    const historyRequestId = options.historyRequestId ?? sessionHistoryLoadRequestRef.current;
    const isCurrentRequest = () => (
      selectedSessionIdRef.current === binding.daemon_session_id
      && sessionHistoryLoadRequestRef.current === historyRequestId
    );
    if (!options.quiet) {
      setSessionItemsLoading(!cachedSessionHistory(binding.daemon_session_id));
      setSessionItemsError(null);
    }

    try {
      const trace = options.historyRequestId !== undefined ? switchTraceRef.current : null;
      trace?.("history-request");
      const count = await loadHistoryTail(binding.daemon_session_id, isCurrentRequest);
      trace?.("history-response", { count });
      if (!isCurrentRequest()) return [];
      const cached = cachedSessionHistory(binding.daemon_session_id);
      const mergedItems = cached?.items ?? [];
      const prevCursor = cached?.prevCursor ?? null;
      sessionHistoryBackfillNeededRef.current = prevCursor && hasUnresolvedTurnItems(mergedItems)
        ? binding.daemon_session_id
        : null;
      sessionItemsPrevCursorRef.current = prevCursor;
      setSessionItemsLoadedForSessionId(binding.daemon_session_id);
      if (!sessionHistoryBackfillNeededRef.current) setSessionItemsError(null);
      scheduleCurrentTurnHistoryBackfill(binding, historyRequestId, mergedItems, prevCursor);
      if (trace) traceNextPaint(trace, "history-paint-opportunity");
      return mergedItems;
    } catch (error) {
      if (isCurrentRequest()) {
        setSessionItemsError(errorMessage(error));
      }
      return sessionHistoryCacheRef.current.get(binding.daemon_session_id)?.items ?? [];
    } finally {
      if (!options.quiet && isCurrentRequest()) {
        setSessionItemsLoading(false);
      }
    }
  }

  function scheduleCurrentTurnHistoryBackfill(
    binding: DaemonSessionBinding,
    historyRequestId: number,
    items: DisplayItem[],
    prevCursor: string | null,
  ): void {
    if (!prevCursor || !hasUnresolvedTurnItems(items)) return;
    const pending = sessionHistoryBackfillRef.current;
    if (pending?.sessionId === binding.daemon_session_id && pending.historyRequestId === historyRequestId) return;
    const request = { sessionId: binding.daemon_session_id, historyRequestId };
    sessionHistoryBackfillRef.current = request;
    void backfillCurrentTurnHistory(binding, historyRequestId, items, prevCursor).finally(() => {
      if (sessionHistoryBackfillRef.current === request) {
        sessionHistoryBackfillRef.current = null;
      }
    });
  }

  async function backfillCurrentTurnHistory(
    binding: DaemonSessionBinding,
    historyRequestId: number,
    initialItems: DisplayItem[],
    initialCursor: string | null,
  ): Promise<void> {
    let mergedItems = initialItems;
    let prevCursor = initialCursor;
    const trace = switchTraceRef.current;
    trace?.("backfill-start", { count: initialItems.length });
    try {
      while (prevCursor && hasUnresolvedTurnItems(mergedItems)) {
        const older = await client.listSessionItems(binding.daemon_session_id, {
          limit: 200,
          before: Number(prevCursor),
        });
        if (
          selectedSessionIdRef.current !== binding.daemon_session_id
          || sessionHistoryLoadRequestRef.current !== historyRequestId
        ) {
          return;
        }
        prevCursor = older.prev_cursor || null;
        mergedItems = mergeCachedSessionHistory(binding.daemon_session_id, older.items, prevCursor);
        sessionItemsPrevCursorRef.current = prevCursor;
      }
      if (
        selectedSessionIdRef.current === binding.daemon_session_id
        && sessionHistoryLoadRequestRef.current === historyRequestId
      ) {
        const cached = sessionHistoryCacheRef.current.get(binding.daemon_session_id);
        const backfillStillNeeded = Boolean(
          cached?.prevCursor && hasUnresolvedTurnItems(cached.items),
        );
        sessionHistoryBackfillNeededRef.current = backfillStillNeeded
          ? binding.daemon_session_id
          : null;
        if (!backfillStillNeeded) setSessionItemsError(null);
        trace?.("backfill-complete", { count: cached?.items.length ?? 0 });
        if (trace) traceNextPaint(trace, "backfill-paint-opportunity");
      }
    } catch (error) {
      if (
        selectedSessionIdRef.current === binding.daemon_session_id
        && sessionHistoryLoadRequestRef.current === historyRequestId
      ) {
        setSessionItemsError(errorMessage(error));
      }
    }
  }

  useConversationTitle(
    selectedBinding?.daemon_session_id === sessionItemsLoadedForSessionId ? selectedConversation : null,
    sessionItems,
    client.suggestConversationTitle,
    (id, previousTitle, title) => applyDesktopState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === id && conversation.title === previousTitle ? { ...conversation, title } : conversation),
    })),
  );

  function applyDurableItemEffects(sessionId: string, items: DisplayItem[]) {
    const profileResult = latestProfileResult(items);
    if (profileResult?.profile?.to) {
      setProfileOverrides((current) => {
        if (current[sessionId] !== profileResult.profile?.to) {
          return current;
        }
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    }
  }

  // Hoisted for useWorkspaceSourceDrafts, which is called before these bindings are declared.
  function expandProject(projectId: string) {
    setCollapsedProjectIds((current) => {
      if (!current.has(projectId)) return current;
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
  }

  function isHostSwitching(): boolean {
    return hostSwitchingRef.current;
  }

  // Hoisted for useProjectSourceDrafts, which is called before useWorkspaceSourceDrafts.
  function closeWorkspaceSourcesForProjectDrafts() {
    closeWorkspaceSources();
  }

  async function selectProject(id: string | null) {
    const revision = ++navigationRevision.current;
    setRepositoriesOpen(false);
    setWebNavigationOpen(false);
    setMessage(null);
    if (client.saveSelection) {
      const next = {projectId:id,workspaceId:null,sessionId:null};
      await client.saveSelection(next);
      if (navigationRevision.current !== revision) return;
      applyDesktopState(current => ({...current,selectedProjectId:id,selectedWorkspaceId:null,selectedConversationId:null}));
    } else {
      const state = await client.selectProject(id);
      if (navigationRevision.current === revision) applyDesktopState(state);
    }
  }

  async function openProjectOverview(project: DesktopProject) {
    leaveChannelsImmediately();
    setProjectOverviewId(project.id);
    await selectProject(project.id);
  }

  function toggleProjectOpen(projectId: string) {
    if (revealProjectId === projectId) {
      setSearchTarget(null);
      if (collapsedProjectIds.has(projectId)) return;
    }
    setCollapsedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  async function selectWorkspace(id: string) {
    setRepositoriesOpen(false);
    setWebNavigationOpen(false);
    setProjectOverviewId(null);
    setMessage(null);
    const workspace = desktopState.workspaces.find(item => item.id === id);
    if (!workspace) return;
    const revision = ++navigationRevision.current;
    const previous = { selectedProjectId: desktopState.selectedProjectId, selectedWorkspaceId: desktopState.selectedWorkspaceId, selectedConversationId: desktopState.selectedConversationId };
    applyDesktopState(current => ({ ...current, selectedProjectId: workspace.project_id, selectedWorkspaceId: id, selectedConversationId: null }));
    try {
      if (client.saveSelection) await client.saveSelection({ projectId: workspace.project_id, workspaceId: id, sessionId: null });
      else await client.selectWorkspace(id);
    } catch (error) {
      if (revision !== navigationRevision.current) return;
      applyDesktopState(current => current.selectedWorkspaceId === id && !current.selectedConversationId ? { ...current, ...previous } : current);
      setMessage(errorMessage(error));
    }
  }

  function markConversationRead(conversationId: string) {
    const state = sessions.find(session => session.id === conversationId)?.read_state;
    if (state?.unread) void updateConversationReadState(conversationId, state.version);
  }

  function markConversationUnread(conversationId: string) {
    void updateConversationReadState(conversationId, null);
  }

  function updateConversationReadState(id: string, version: number | null) {
    // Serialize explicit actions behind an in-flight auto-ack instead of losing
    // a user's "mark unread" click while a request is pending.
    const pending = (readRequests.current.get(id) ?? Promise.resolve()).then(async () => {
      try {
        const state = await client.setSessionReadState(id, version);
        if (version === null) manualUnread.current = { id, version: state.version };
        if (readRequests.current.get(id) === pending) readRequests.current.delete(id);
        setSessions(current => current.map(session => session.id === id ? { ...session, read_state: mergeReadState(session.read_state, state) } : session));
      } catch (error) { setMessage(errorMessage(error)); }
    }).finally(() => {
      if (readRequests.current.get(id) === pending) readRequests.current.delete(id);
    });
    readRequests.current.set(id, pending);
    return pending;
  }

  function openConversationContextMenu(event: ReactMouseEvent, conversationId: string) {
    event.preventDefault();
    const menuWidth = 184;
    const menuHeight = 170;
    setConversationContextMenu({
      conversationId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  }

  function selectConversation(id: string, sourceState = desktopState, preserveChannels = false) {
    navigationRevision.current++;
    if (!preserveChannels) leaveChannelsImmediately();
    setWebNavigationOpen(false);
    setConversationContextMenu(null);
    const conversation = sourceState.conversations.find((candidate) => candidate.id === id);
    if (!conversation || sourceState.selectedConversationId === id) {
      return;
    }
    switchTraceRef.current = traceInteraction("session-switch");
    setProjectOverviewId(null);
    setMessage(null);
    const binding = sourceState.bindings.find((candidate) => candidate.conversation_id === id);
    const cachedHistory = binding ? cachedSessionHistory(binding.daemon_session_id) : null;
    sessionItemsRef.current = cachedHistory?.items ?? [];
    setSessionItems(cachedHistory?.items ?? []);
    setSessionItemsLoading(Boolean(binding) && !cachedHistory);
    switchTraceRef.current?.("cache", { cached: Boolean(cachedHistory), count: cachedHistory?.items.length ?? 0 });
    if (switchTraceRef.current) traceNextPaint(switchTraceRef.current, "initial-paint-opportunity");
    setEphemeralBlocks([]);
    setOptimisticPromptItems([]);
    promptAnchors.current.clear();
    promptRetries.current.clear();
    promptRecovery.current.forEach(recovery => recovery.release());
    promptRecovery.current.clear();
    applyDesktopState((current) => ({
      ...current,
      selectedProjectId: conversation.project_id,
      selectedWorkspaceId: conversation.workspace_id,
      selectedConversationId: id,
    }));
    if (client.saveSelection) {
      void client.saveSelection({ projectId: conversation.project_id, workspaceId: conversation.workspace_id, sessionId: id }).catch(error => setMessage(errorMessage(error)));
      return;
    }
    void client.selectConversation(id)
      .then((state) => {
        applyDesktopState((current) => current.selectedConversationId === id ? state : current);
      })
      .catch((error: unknown) => {
        setMessage(errorMessage(error));
        void client.getDesktopState().then((state) => {
          applyDesktopState((current) => current.selectedConversationId === id ? state : current);
        });
      });
  }

  async function openNewConversation() {
    leaveChannelsImmediately();
    setWebNavigationOpen(false);
    setProjectOverviewId(null);
    setMessage(null);
    await selectProject(null);
  }

  function revealWorkspace(workspace: DesktopWorkspace) {
    showRecentSessions(false);
    setSearchTarget({ kind: "workspace", id: workspace.id });
    void selectWorkspace(workspace.id);
  }

  /**
   * Scrolls the sidebar to the current session (or workspace) exactly as a
   * search result does. It only switches the sidebar to the tree; unlike
   * revealSession it does not reselect, so Web keeps the navigation open.
   */
  function revealCurrentSelection() {
    const target = selectedConversation ? { kind: "session" as const, id: selectedConversation.id }
      : selectedWorkspace ? { kind: "workspace" as const, id: selectedWorkspace.id } : null;
    if (!target) return;
    showRecentSessions(false);
    setRepositoriesOpen(false);
    setProjectOverviewId(null);
    setSearchTarget(target);
  }

  function revealSession(id: string, sourceState = desktopState) {
    showRecentSessions(false);
    setRepositoriesOpen(false);
    setProjectOverviewId(null);
    selectConversation(id, sourceState);
    setSearchTarget({ kind: "session", id });
  }

  // Other surfaces (Usage settings) open sessions that may be outside the loaded pages.
  // A remount after a host switch must not replay the previous host's request.
  const handledOpenSessionRequest = useRef(openSessionRequest?.nonce ?? null);
  useEffect(() => {
    if (!openSessionRequest || handledOpenSessionRequest.current === openSessionRequest.nonce) return;
    handledOpenSessionRequest.current = openSessionRequest.nonce;
    const { id, nonce } = openSessionRequest;
    // Any navigation while the session loads (a sidebar click, recent
    // sessions, Channels) wins over this request.
    const revision = navigationRevision.current;
    const current = () => handledOpenSessionRequest.current === nonce && navigationRevision.current === revision;
    void loadSessionIntoState(desktopState, id, client.querySessions).then(({ state, page }) => {
      if (!current()) return;
      if (page) { applyDesktopState(state); mergeLoadedSessions(page.sessions); }
      const binding = state.bindings.find((value) => value.daemon_session_id === id);
      if (!binding || !state.conversations.some((value) => value.id === binding.conversation_id)) throw new Error(t("app.sessionNotInCatalog"));
      revealSession(binding.conversation_id, state);
    }).catch((error: unknown) => { if (current()) setMessage(errorMessage(error)); });
  }, [openSessionRequest]);

  async function openNewConversationForWorkspace(workspace: DesktopWorkspace) {
    leaveChannelsImmediately();
    setWebNavigationOpen(false);
    setProjectOverviewId(null);
    setMessage(null);
    await selectWorkspace(workspace.id);
  }

  useEffect(() => {
    if (!surfaceActive) return;
    const closeSession = (event: Event) => {
      if (!desktopState.selectedConversationId) return;
      event.preventDefault();
      void openNewConversation().catch((error: unknown) => setMessage(errorMessage(error)));
    };
    window.addEventListener("zotigo:close-session", closeSession);
    return () => window.removeEventListener("zotigo:close-session", closeSession);
  }, [surfaceActive, desktopState.selectedConversationId, client]);

  async function retryWorkspace(workspace: DesktopWorkspace) {
    setIsBusy(true);
    setMessage(null);
    try {
      const state = await client.retryWorkspace(workspace.id);
      applyDesktopState(state);
      const repaired = state.workspaces.find((candidate) => candidate.id === workspace.id);
      if (repaired?.status === "error") {
        setMessage(repaired.error || t("app.workspaceRepairFailed"));
      }
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    } finally {
      setIsBusy(false);
    }
  }

  function clearProjectOverview() {
    setProjectOverviewId(null);
  }

  function clearProjectOverviewIfShowing(projectId: string) {
    if (projectOverviewId === projectId) setProjectOverviewId(null);
  }

  async function confirmAddSources() {
    if (!addSourcesProjectId || repositoryAdding) return;
    setIsBusy(true);
    setMessage(null);
    try {
      if (workspaceSourcesTarget) {
        await addWorkspaceRepositories(client, workspaceSourcesTarget, newProjectRepositoryIds, applyDesktopState);
        await loadWorkspaceSources(workspaceSourcesTarget.id);
      } else {
        applyDesktopState(await client.addProjectSources(addSourcesProjectId, [...newProjectRepositoryIds.map(repositoryId => ({ repositoryId })), ...newProjectSources.map(projectSourceInput)]));
      }
      setAddSourcesProjectId(null);
      setNewProjectSources([]);
    } catch (error) {
      setMessage(errorMessage(error));
      if (workspaceSourcesTarget) await loadWorkspaceSources(workspaceSourcesTarget.id);
    }
    finally { setIsBusy(false); }
  }

  function updateComposerDraft(key: string, update: (draft: ComposerDraft) => ComposerDraft) {
    setComposerDrafts((current) => updateComposerDrafts(current, key, update));
  }

  function updateActivePrompt(value: string, caret?: number, referencedSkills?: string[]) {
    setPromptCaret(caret ?? value.length);
    updateComposerDraft(composerDraftKey, (draft) => ({ ...draft, prompt: value, selectedSkillNames: referencedSkills ?? [...new Set(editorSkillTokens(value, draft.selectedSkillNames).map(token => token.name))] }));
    setSkillMenuDismissed(false);
  }

  function selectComposerSkill(skill: SkillSummary) {
    if (!activeSkillCommand || !skill.enabled) return;
    const prompt = insertSkillCommand(activePrompt, activeSkillCommand, promptCaret ?? activePrompt.length, skill.name);
    updateComposerDraft(composerDraftKey, (draft) => ({
      ...draft,
      prompt,
      selectedSkillNames: draft.selectedSkillNames.includes(skill.name)
        ? draft.selectedSkillNames
        : [...draft.selectedSkillNames, skill.name],
    }));
    if (selectedConversation) window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
    setSkillMenuDismissed(true);
    setSkillMenuIndex(0);
  }

  function handleSkillMenuKeyDown(event: globalThis.KeyboardEvent): boolean {
    if (!skillMenuOpen) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setSkillMenuDismissed(true);
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (skillMatches.length > 0) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSkillMenuIndex((current) => (current + direction + skillMatches.length) % skillMatches.length);
      }
      return true;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (skillMatches.length > 0) {
        selectComposerSkill(skillMatches[Math.min(skillMenuIndex, skillMatches.length - 1)]);
      }
      return true;
    }
    return false;
  }

  async function createConversation(prompt: string) {
    const trimmedPrompt = skillPromptText(prompt, activeComposerDraft.selectedSkillNames).trim();
    if (trimmedPrompt === "/compact" || trimmedPrompt === "/compress") {
      setMessage(t("app.openAnExistingIdleZotigoSessionToCompact"));
      return;
    }
    if (attachmentsBlocked) return;
    if (!trimmedPrompt && composerAttachments.length === 0) {
      return;
    }

    const trace = traceInteraction("new-session");
    const submittedDraftKey = composerDraftKey;
    const submittedDraft = activeComposerDraft;
    const submittedAttachments = submittedDraft.attachments;
    const submittedSkills = submittedDraft.selectedSkillNames;
    const preview = optimisticPromptDisplayItem({ id: createOptimisticPromptId(), text: trimmedPrompt || submittedAttachments.map(item => item.name).join("\n"), steering: false, createdAt: new Date().toISOString() });
    setNewPromptPreview({ draftKey: submittedDraftKey, item: preview });
    trace("optimistic-state");
    traceNextPaint(trace, "optimistic-paint-opportunity");
    newPromptRecovery.current = {
      restore: () => {
        updateComposerDraft(submittedDraftKey, current => restoreSubmittedDraft(current, submittedDraft));
        setNewPromptPreview(null);
        newPromptRecovery.current = null;
      },
      discard: () => {
        for (const attachment of submittedAttachments) if (attachment.url) URL.revokeObjectURL(attachment.url);
        setNewPromptPreview(null);
        newPromptRecovery.current = null;
      },
    };
    updateComposerDraft(submittedDraftKey, () => emptyComposerDraft());
    setPreviewAttachmentId(null);
    setIsBusy(true);
    setMessage(null);
    // Once the session exists, the prompt preview and any retry belong to its draft.
    let deliveryDraftKey = submittedDraftKey;
    let sessionCreated = false;
    const submittedScope = promptScope.current;
    let createdScope = submittedScope;
    const failDelivery = (error: string, state: "failed" | "rejected") => {
      setNewPromptPreview({ draftKey: deliveryDraftKey, item: { ...preview, delivery: { state, error } }, sessionCreated });
      // A failure for a session the user already left must not surface in another one.
      // The scope may still be the submitted one if React has not rendered the new selection yet.
      if (promptScope.current === submittedScope || promptScope.current === createdScope) setMessage(sessionCreated ? error : t("app.checkTheSessionListBeforeRestoringThisDraft", { p0: error }));
      if (newPromptRecovery.current && sessionCreated) {
        const retryDraftKey = deliveryDraftKey;
        newPromptRecovery.current.restore = () => {
          updateComposerDraft(retryDraftKey, current => restoreSubmittedDraft(current, submittedDraft));
          setNewPromptPreview(null);
          newPromptRecovery.current = null;
        };
      }
    };
    try {
      const provisionalTitle = titleFromPrompt(trimmedPrompt);
      const images = await Promise.all(submittedAttachments.filter((attachment) => attachment.kind === "image").map(attachmentToMessageImage));
      const files = await Promise.all(submittedAttachments.filter((attachment) => attachment.kind !== "image" && attachment.upload?.state !== "ready").map(attachmentToMessageFile));
      trace("request");
      // Create first so navigation shows the session while its worker starts.
      const created = await client.createConversation({
        projectId: desktopState.selectedProjectId,
        workspaceId: desktopState.selectedWorkspaceId,
        title: provisionalTitle,
        agent: selectedAgent,
        ...(selectedAgent === "codex"
          ? {
              model: selectedCodexModel,
              reasoningEffort: selectedCodexReasoningEffort,
              approvalPolicy: selectedApprovalPolicy ?? "auto",
            }
          : {
              profile: selectedProfile || undefined,
              approvalPolicy: selectedApprovalPolicy ?? "auto",
            }),
      });
      trace("created");
      applyDesktopActionResult(created);
      if (created.error || !created.session) {
        const error = created.error ?? t("app.sessionNotInCatalog");
        if (created.deliveryState === "rejected") {
          // The daemon refused creation; nothing exists to check before restoring.
          setNewPromptPreview({ draftKey: deliveryDraftKey, item: { ...preview, delivery: { state: "rejected", error } } });
          if (promptScope.current === submittedScope) setMessage(error);
        } else failDelivery(error, "failed");
        return;
      }
      pagedNavigation.refresh();
      sessionCreated = true;
      deliveryDraftKey = draftKeyForSelection({
        conversationId: created.state?.selectedConversationId ?? created.session.id,
        projectId: created.state?.selectedProjectId ?? null,
        workspaceId: created.state?.selectedWorkspaceId ?? null,
      });
      createdScope = `${clientScope}:${created.state?.selectedConversationId ?? created.session.id}`;
      setNewPromptPreview({ draftKey: deliveryDraftKey, item: preview, sessionCreated });
      const result = await client.sendConversationMessage({
        conversationId: created.session.id,
        clientMessageId: preview.id,
        text: trimmedPrompt,
        skills: submittedSkills.length > 0 ? submittedSkills : undefined,
        images: images.length > 0 ? images : undefined,
        files: files.length > 0 ? files : undefined,
      });
      trace("response");
      applyDesktopActionResult(result);
      if (result.error) {
        failDelivery(result.error, result.deliveryState === "rejected" ? "rejected" : "failed");
      } else {
        // Keep the delivered prompt visible until its user_message reaches the timeline.
        setNewPromptPreview(current => current?.item.id === preview.id ? { ...current, item: { ...preview, delivery: undefined } } : current);
        newPromptRecovery.current = null;
        for (const attachment of submittedAttachments) {
          if (attachment.url) URL.revokeObjectURL(attachment.url);
        }
        void refreshSessions({ quiet: true });
      }
    } catch (error) {
      failDelivery(errorMessage(error), "failed");
    } finally {
      setIsBusy(false);
    }
  }

  function rememberModelSelection(selection: ModelFavorite) {
    setDraftAgent(selection.agent);
    if (selection.agent === "codex") {
      setDraftCodexModel(selection.model);
      setDraftCodexReasoningEffort(selection.reasoningEffort);
    } else setDraftProfile(selection.profile);
    saveLastModelSelection(clientScope, selection);
  }

  function selectAgent(agent: AgentKind) {
    if (selectedSession) return;
    rememberModelSelection(agent === "codex"
      ? { agent, model: draftCodexModel, reasoningEffort: draftCodexReasoningEffort }
      : { agent, profile: draftProfile || defaultProfile });
  }

  function selectCodexModel(modelId: string) {
    if (selectedSession) return;
    const model = codexModels.find((candidate) => candidate.id === modelId);
    rememberModelSelection({ agent: "codex", model: modelId, reasoningEffort: compatibleReasoningEffort(model?.supported_reasoning_efforts ?? [], draftCodexReasoningEffort) });
  }

  async function selectSessionCodexSettings(model: string, reasoningEffort: string) {
    if (!selectedSession || selectedAgent !== "codex") return;
    setIsBusy(true);
    setMessage(null);
    try {
      const session = await client.changeSessionCodexSettings(selectedSession.id, { model, reasoningEffort });
      rememberModelSelection({ agent: "codex", model, reasoningEffort });
      setSessions((current) => upsertSession(current, session));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function submitSelectedPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mode = submitModeRef.current ?? defaultSendMode;
    submitModeRef.current = null;
    const text = referencePrompt(skillPromptText(activePrompt, activeComposerDraft.selectedSkillNames).trim(), activeComposerDraft.references);
    if (!selectedConversation || runtimeOccupied || isBusy || attachmentsBlocked || (!text && composerAttachments.length === 0)) {
      return;
    }
    if ((text === "/compact" || text === "/compress") && composerAttachments.length === 0 && activeComposerDraft.selectedSkillNames.length === 0) {
      if ((selectedSession?.agent ?? selectedAgent) === "codex") {
        setMessage(t("app.compactNativeOnly"));
        return;
      }
      if (selectedSession?.working || hasActiveTurn || selectedSession?.state === "paused") {
        setMessage(t("app.waitForTheCurrentTurnToFinishOr"));
        return;
      }
    }

    const trace = traceInteraction("send-message");
    closeSearchWindow();
    const conversationId = selectedConversation.id;
    const submittedDraftKey = composerDraftKey;
    const submittedDraft = activeComposerDraft;
    const submittedAttachments = submittedDraft.attachments;
    const submittedSkills = submittedDraft.selectedSkillNames;
    const optimisticId = createOptimisticPromptId();
    const isSteering = mode === "steering" && Boolean(selectedSession?.working && sessionAllowsActiveTurn(selectedSession.state));
    const optimisticItem = optimisticPromptDisplayItem({
      id: optimisticId,
      text: [text, ...submittedAttachments.filter((attachment) => attachment.kind !== "image").map((attachment) => attachment.name)].filter(Boolean).join("\n\n"),
      images: submittedAttachments.filter((attachment) => attachment.kind === "image").map((attachment) => ({
        url: attachment.url,
        mime_type: attachment.mimeType,
      })),
      steering: isSteering,
      skills: submittedSkills,
      createdAt: new Date().toISOString(),
    });
    optimisticItem.queuedPreview = mode === "queue";
    const revokeSubmittedAttachments = () => {
      for (const attachment of submittedAttachments) {
        if (attachment.url) URL.revokeObjectURL(attachment.url);
      }
    };

    setStickToBottom(true);
    setIsBusy(true);
    setMessage(null);
    if (mode !== "queue") promptAnchors.current.set(optimisticId, capturePromptTimelineAnchor(
      sessionItems.reduce((max, item) => Math.max(max, item.sequence), 0),
      ephemeralBlocks.map(block => block.id),
      promptAnchors.current,
    ));
    setOptimisticPromptItems((current) => [...current, optimisticItem]);
    trace("optimistic-state");
    traceNextPaint(trace, "optimistic-paint-opportunity");
    updateComposerDraft(submittedDraftKey, () => emptyComposerDraft());
    setPreviewAttachmentId(null);
    const scope = promptScope.current;
    let sending = false;
    const removeFailedPrompt = () => {
      setOptimisticPromptItems(current => current.filter(item => item.id !== optimisticId));
      promptRetries.current.delete(optimisticId);
      promptAnchors.current.delete(optimisticId);
      promptRecovery.current.delete(optimisticId);
    };
    promptRecovery.current.set(optimisticId, {
      release: revokeSubmittedAttachments,
      restore: () => {
        updateComposerDraft(submittedDraftKey, current => restoreSubmittedDraft(current, submittedDraft));
        removeFailedPrompt();
      },
      discard: () => { revokeSubmittedAttachments(); removeFailedPrompt(); },
    });
    const send = async () => {
      if (sending || promptScope.current !== scope) return;
      sending = true;
      setMessage(null);
      setIsBusy(true);
      setOptimisticPromptItems(current => current.map(item => item.id === optimisticId ? { ...item, delivery: { state: "sending" } } : item));
      let dispatched = false;
      try {
        const images = await Promise.all(submittedAttachments.filter((attachment) => attachment.kind === "image").map(attachmentToMessageImage));
        const files = await Promise.all(submittedAttachments.filter((attachment) => attachment.kind !== "image" && attachment.upload?.state !== "ready").map(attachmentToMessageFile));
        dispatched = true;
        trace("request");
        const result = await client.sendConversationMessage({
          mode,
          conversationId,
          clientMessageId: optimisticId,
          text: appendUploadedReferences(text, submittedAttachments),
          skills: submittedSkills.length > 0 ? submittedSkills : undefined,
          images: images.length > 0 ? images : undefined,
          files: files.length > 0 ? files : undefined,
          approvalPolicy: selectedSession ? undefined : selectedApprovalPolicy ?? "auto",
        });
        trace("response");
        if (promptScope.current !== scope) return;
        applyDesktopActionResult(result);
        if (result.error) {
          setOptimisticPromptItems(current => current.map(item => item.id === optimisticId ? { ...item, delivery: { state: result.deliveryState === "rejected" ? "rejected" : "failed", error: result.error } } : item));
          if (result.errorCode === "runtime_occupied") {
            await refreshSessions({ quiet: true });
          } else {
            setMessage(result.error);
          }
        } else if (result.command?.type === "queued") {
          setOptimisticPromptItems(current => current.map(item => item.id === optimisticId ? { ...item, queueConfirmed: true } : item));
          promptRetries.current.delete(optimisticId);
          setQueueRefresh(value => value + 1);
        } else {
          const command = result.command;
          if (!command) {
            throw new Error(t("app.messageResponseDidNotIncludeACommand"));
          }
          setOptimisticPromptItems((current) => current.flatMap((item) => {
            if (item.id !== optimisticId) return [item];
            const acknowledged = acknowledgeOptimisticPrompt(item, command, sessionItemsRef.current);
            return acknowledged ? [acknowledged] : [];
          }));
          promptRetries.current.delete(optimisticId);
          promptRecovery.current.delete(optimisticId);
          requestAnimationFrame(revokeSubmittedAttachments);
          void refreshSessions({ quiet: true });
        }
      } catch (error) {
        if (promptScope.current !== scope) return;
        setOptimisticPromptItems(current => current.map(item => item.id === optimisticId ? { ...item, delivery: { state: dispatched ? "failed" : "rejected", error: errorMessage(error) } } : item));
        setMessage(errorMessage(error));
        void refreshSessions({ quiet: true });
      } finally {
        sending = false;
        setIsBusy(false);
      }
    };
    promptRetries.current.set(optimisticId, send);
    await send();
  }

  async function retryRuntimeOccupiedSession() {
    if (!selectedConversation || isBusy) {
      return;
    }
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await client.startConversationSession(selectedConversation.id);
      applyDesktopActionResult(result);
      if (result.error && result.errorCode !== "runtime_occupied") {
        setMessage(result.error);
      }
      await refreshSessions({ quiet: true });
    } finally {
      setIsBusy(false);
    }
  }

  const submitApproval = useCallback(async (
    approvalId: string,
    decisions: ApprovalDecisionInput[],
  ) => {
    if (!selectedBinding || submittingApprovalIdsRef.current.has(approvalId)) return;
    submittingApprovalIdsRef.current.add(approvalId);
    setSubmittingApprovalIds(new Set(submittingApprovalIdsRef.current));
    setMessage(null);
    try {
      await client.submitSessionApproval(
        selectedBinding.daemon_session_id,
        approvalId,
        decisions,
      );
      await Promise.all([
        refreshSessionItems(selectedBinding, { quiet: true }),
        refreshSessions({ quiet: true }),
      ]);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      submittingApprovalIdsRef.current.delete(approvalId);
      setSubmittingApprovalIds(new Set(submittingApprovalIdsRef.current));
    }
  }, [selectedBinding]);

  const submitInteraction = useCallback(async (
    interactionId: string,
    answers: Record<string, string[]>,
  ) => {
    if (!selectedBinding || submittingInteractionIdsRef.current.has(interactionId)) return;
    submittingInteractionIdsRef.current.add(interactionId);
    setSubmittingInteractionIds(new Set(submittingInteractionIdsRef.current));
    setMessage(null);
    try {
      await client.submitSessionInteraction(selectedBinding.daemon_session_id, interactionId, answers);
      await Promise.all([
        refreshSessionItems(selectedBinding, { quiet: true }),
        refreshSessions({ quiet: true }),
      ]);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      submittingInteractionIdsRef.current.delete(interactionId);
      setSubmittingInteractionIds(new Set(submittingInteractionIdsRef.current));
    }
  }, [selectedBinding]);

  function handleComposerKeyDown(event: globalThis.KeyboardEvent) {
    if (event.isComposing) {
      return;
    }
    if (handleSkillMenuKeyDown(event)) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitModeRef.current = event.metaKey || event.ctrlKey ? alternateSendMode(defaultSendMode) : defaultSendMode;
      (event.target as HTMLElement).closest("form")?.requestSubmit();
    }
  }

  function handleNewPromptKeyDown(event: globalThis.KeyboardEvent) {
    if (event.isComposing) return;
    if (handleSkillMenuKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      (event.target as HTMLElement).closest("form")?.requestSubmit();
    }
  }

  function handleComposerPaste(event: globalThis.ClipboardEvent) {
    if (!event.clipboardData) return;
    const imageFiles = clipboardFiles(event.clipboardData);
    if (imageFiles.length === 0) {
      return;
    }
    event.preventDefault();
    addComposerAttachments(imageFiles);
  }

  function addComposerAttachments(files: File[]) {
    if (files.length === 0) {
      return;
    }
    const acceptedFiles: File[] = [];
    const sizes = composerAttachments.map((attachment) => ({ size: attachment.file.size, image: attachment.kind === "image" }));
    for (const file of files) {
      const name = file.name || t("app.pastedFile");
      if (new TextEncoder().encode(name).length > 180 || /[/\\\x00-\x1f]/.test(name) || name === "." || name === "..") {
        setMessage(t("app.invalidAttachmentFilenameMaximum180Utf8Bytes"));
        continue;
      }
      const size = { size: file.size, image: modelImageTypes.has(file.type) };
      const error = attachmentSizeError([...sizes, size]);
      if (error) { setMessage(error); continue; }
      acceptedFiles.push(file);
      sizes.push(size);
    }
    const attachments: ComposerAttachment[] = acceptedFiles.map((file) => ({
      id: crypto.randomUUID(),
      kind: modelImageTypes.has(file.type) ? "image" : file.type.startsWith("video/") ? "video" : "file",
      name: file.name || t("app.pastedFile"),
      file,
      mimeType: file.type,
      url: URL.createObjectURL(file),
      ...(selectedConversation && !modelImageTypes.has(file.type) ? { upload: { state: "uploading" as const } } : {}),
    }));
    updateComposerDraft(composerDraftKey, (current) => ({
      ...current,
      attachments: [...current.attachments, ...attachments],
    }));
    if (selectedConversation) {
      for (const attachment of attachments) {
        if (attachment.kind !== "image") void uploadComposerAttachment(attachment, composerDraftKey, selectedConversation.id);
      }
    }
  }

  async function uploadComposerAttachment(attachment: ComposerAttachment, draftKey: string, sessionId: string) {
    pendingUploadsRef.current++;
    const update = (upload: ComposerAttachment["upload"]) => updateComposerDraft(draftKey, current => ({
      ...current, attachments: current.attachments.map(file => file.id === attachment.id ? { ...file, upload } : file),
    }));
    update({ state: "uploading" });
    try {
      const path = await client.uploadAttachment(sessionId, await attachmentToMessageFile(attachment));
      update({ state: "ready", path });
    } catch (error) {
      update({ state: "failed", error: errorMessage(error) });
    } finally { pendingUploadsRef.current--; }
  }

  function previewComposerAttachment(id: string) {
    const attachment = composerAttachments.find(file => file.id === id);
    if (!attachment) return;
    if (attachment.upload?.state === "failed" && selectedConversation) {
      void uploadComposerAttachment(attachment, composerDraftKey, selectedConversation.id);
    } else if (attachment.upload?.state === "ready") {
      void openTreeFile(attachment.upload.path, { sessionId: selectedConversation?.id, path: workspaceFileRoot });
    } else {
      setPreviewAttachmentId(id);
    }
  }

  function removeComposerAttachment(id: string) {
    updateComposerDraft(composerDraftKey, (current) => {
      const attachment = current.attachments.find((item) => item.id === id);
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return { ...current, attachments: current.attachments.filter((item) => item.id !== id) };
    });
    setPreviewAttachmentId((current) => (current === id ? null : current));
  }

  function openAttachmentPicker(accept = "") {
    const input = attachmentInputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  }

  function handleAttachmentInputChange(event: SyntheticEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    addComposerAttachments(Array.from(input.files ?? []));
    input.value = "";
  }

  async function requestStopSelectedTurn() {
    if (
      !selectedBinding
      || selectedSession?.state !== "running"
      || !selectedActiveTurnId
      || pauseRequestedTurnId === selectedActiveTurnId
      || isBusy
    ) {
      return;
    }

    const binding = selectedBinding;
    const turnId = selectedActiveTurnId;
    setPauseRequestedTurnId(turnId);
    setIsBusy(true);
    setMessage(null);
    try {
      await client.pauseSession(binding.daemon_session_id, turnId);
      if (selectedSessionIdRef.current === binding.daemon_session_id) {
        setMessage(t("app.stoppingTheCurrentTurn"));
        void refreshSessionItems(binding, { quiet: true });
      }
    } catch (error) {
      setPauseRequestedTurnId((current) => current === turnId ? null : current);
      if (selectedSessionIdRef.current === binding.daemon_session_id) {
        setMessage(errorMessage(error));
      }
    } finally {
      setIsBusy(false);
    }
  }

  function handleConversationScroll() {
    const element = conversationScrollRef.current;
    if (!element) {
      return;
    }
    const nextStickToBottom = conversationAutoFollowAfterScroll(
      stickToBottomRef.current,
      isNearScrollBottom(element),
      conversationScrollIntentRef.current,
    );
    setStickToBottom(nextStickToBottom);
    if (conversationShouldLoadOlder(nextStickToBottom, element.scrollTop)) {
      void loadOlderSessionItems();
    }
  }

  function handleConversationWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (event.deltaY !== 0) {
      conversationScrollIntentRef.current = event.deltaY < 0 ? "up" : "down";
    }
    const nextValue = conversationAutoFollowAfterWheel(stickToBottomRef.current, event.deltaY);
    if (nextValue === stickToBottomRef.current) {
      return;
    }
    cancelScheduledConversationAutoScroll();
    setStickToBottom(nextValue);
  }

  function handleConversationKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey) return;
    const intent = conversationScrollIntentForKey(event.key, event.shiftKey);
    if (!intent) return;
    conversationScrollIntentRef.current = intent;
    if (intent === "up" && stickToBottomRef.current) {
      cancelScheduledConversationAutoScroll();
      setStickToBottom(false);
    }
  }

  function handleConversationTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    conversationTouchYRef.current = event.touches[0]?.clientY ?? null;
  }

  function handleConversationTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const previousY = conversationTouchYRef.current;
    const currentY = event.touches[0]?.clientY;
    if (previousY === null || currentY === undefined || currentY === previousY) return;
    const intent: ConversationScrollIntent = currentY > previousY ? "up" : "down";
    conversationScrollIntentRef.current = intent;
    conversationTouchYRef.current = currentY;
    if (intent === "up" && stickToBottomRef.current) {
      cancelScheduledConversationAutoScroll();
      setStickToBottom(false);
    }
  }

  function handleConversationTouchEnd() {
    conversationTouchYRef.current = null;
  }

  async function showSearchWindow(target: number | string, signal?: AbortSignal) {
    const binding = selectedBinding;
    if (!binding) return;
    const request = ++searchWindowRequest.current;
    const page = await client.getSessionItemWindow(binding.daemon_session_id, target);
    if (signal?.aborted || request !== searchWindowRequest.current || selectedSessionIdRef.current !== binding.daemon_session_id) return;
    cancelScheduledConversationAutoScroll(); setStickToBottom(false);
    setSearchWindow(page.items);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return request === searchWindowRequest.current && !signal?.aborted && selectedSessionIdRef.current === binding.daemon_session_id;
  }
  function closeSearchWindow() { searchWindowRequest.current++; setSearchWindow(null); }

  async function editReference(id: string) {
    const reference = activeComposerDraft.references?.find(value => value.id === id);
    if (!reference) return;
    const source = Array.from(conversationScrollRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find(node => node.dataset.messageId === reference.messageId);
    if (!source) {
      try { if (!await showSearchWindow(reference.messageId)) return; }
      catch (error) { toast(errorMessage(error), "error"); return; }
    }
    if (selectedSessionIdRef.current === selectedBinding?.daemon_session_id) setEditingReferenceId(id);
  }

  async function loadOlderSessionItems() {
    const element = conversationScrollRef.current;
    const binding = selectedBinding;
    const cursor = sessionItemsPrevCursorRef.current;
    if (conversationFindOpen.current || searchWindow || !element || !binding || !cursor || olderSessionItemsLoadingRef.current) {
      return;
    }

    olderSessionItemsLoadingRef.current = true;
    const previousHeight = element.scrollHeight;
    const previousTop = element.scrollTop;
    try {
      const response = await client.listSessionItems(binding.daemon_session_id, {
        limit: 200,
        before: Number(cursor),
      });
      if (selectedSessionIdRef.current !== binding.daemon_session_id) {
        return;
      }
      sessionItemsPrevCursorRef.current = response.prev_cursor || null;
      mergeCachedSessionHistory(
        binding.daemon_session_id,
        response.items,
        sessionItemsPrevCursorRef.current,
      );
      requestAnimationFrame(() => {
        const currentElement = conversationScrollRef.current;
        if (currentElement && selectedSessionIdRef.current === binding.daemon_session_id) {
          currentElement.scrollTop = previousTop + currentElement.scrollHeight - previousHeight;
        }
        olderSessionItemsLoadingRef.current = false;
      });
    } catch (error) {
      if (selectedSessionIdRef.current === binding.daemon_session_id) {
        setSessionItemsError(errorMessage(error));
      }
      olderSessionItemsLoadingRef.current = false;
    }
  }

  function scrollConversationToBottom(options: { smooth?: boolean } = {}) {
    const element = conversationScrollRef.current;
    if (!element) {
      return;
    }
    conversationScrollIntentRef.current = null;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: options.smooth ? "smooth" : "auto",
    });
    setStickToBottom(true);
  }

  function scheduleConversationScrollToBottom() {
    cancelScheduledConversationAutoScroll();
    conversationAutoScrollFrameRef.current = requestAnimationFrame(() => {
      conversationAutoScrollFrameRef.current = null;
      if (stickToBottomRef.current) {
        scrollConversationToBottom();
      }
    });
  }

  function cancelScheduledConversationAutoScroll() {
    if (conversationAutoScrollFrameRef.current === null) {
      return;
    }
    cancelAnimationFrame(conversationAutoScrollFrameRef.current);
    conversationAutoScrollFrameRef.current = null;
  }

  function setStickToBottom(nextValue: boolean) {
    stickToBottomRef.current = nextValue;
    setIsConversationAtBottom((current) => (current === nextValue ? current : nextValue));
  }

  function applyDesktopActionResult(result: DesktopActionResult) {
    if (result.state) applyDesktopState(result.state);
    const session = result.session;
    if (session) {
      setSessions((current) => upsertSession(current, session));
      setConnectionState("online");
    }
  }

  async function toggleNavigationPinned(item: NavigationItem) {
    setProjectMenuId(null);
    setWorkspaceMenuId(null);
    try {
      applyDesktopState(await client.setNavigationPinned(item, !isNavigationPinned(item.kind, item.id)));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function toggleConversationPinned(conversation: DesktopConversation) {
    try {
      applyDesktopState(await client.setConversationPinned(conversation.id, !conversation.pinned_at));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function archiveConversation(conversation: DesktopConversation) {
    setSidebarActionError(null);
    setArchiveTarget(conversation);
  }

  async function confirmArchiveSession() {
    if (!archiveTarget || archivingSession) return;
    const conversation = archiveTarget;
    setArchivingSession(true);
    setSidebarActionError(null);
    try {
      applyDesktopState(await client.archiveConversation(conversation.id));
      setDesktopState(current => ({...current, conversations: current.conversations.filter(item => item.id !== conversation.id), bindings: current.bindings.filter(item => item.conversation_id !== conversation.id)}));
      pagedNavigation.refresh();
      setArchiveTarget(null);
    } catch (error) {
      setSidebarActionError(t("app.couldNotArchive", { p0: conversation.title, p1: errorMessage(error) }));
    } finally {
      setArchivingSession(false);
    }
  }

  function scheduleFileSave(filePath: string) {
    if (hostSwitchingRef.current) return;
    const existing = fileSaveTimersRef.current.get(filePath);
    if (existing !== undefined) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      fileSaveTimersRef.current.delete(filePath);
      void saveOpenFile(filePath);
    }, 800);
    fileSaveTimersRef.current.set(filePath, timer);
  }

  function updateFileDraft(filePath: string, draft: string) {
    const current = openFilesRef.current;
    const existing = current[filePath];
    if (!existing || existing.kind !== "text" || existing.file.readOnly || existing.draft === draft) return;
    const next = {
      ...current,
      [filePath]: { ...existing, draft, saveStatus: "dirty" as const, saveError: undefined },
    };
    openFilesRef.current = next;
    setOpenFiles(next);
    scheduleFileSave(filePath);
  }

  function updateFileMode(filePath: string, mode: FileEditorMode) {
    const current = openFilesRef.current;
    const existing = current[filePath];
    if (!existing || existing.kind !== "text" || existing.mode === mode) return;
    const next = { ...current, [filePath]: { ...existing, mode } };
    openFilesRef.current = next;
    setOpenFiles(next);
  }

  async function saveOpenFile(filePath: string): Promise<boolean> {
    const existingTimer = fileSaveTimersRef.current.get(filePath);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      fileSaveTimersRef.current.delete(filePath);
    }
    const current = openFilesRef.current[filePath];
    if (!current || current.kind !== "text" || current.file.readOnly || current.saveStatus === "clean") return true;
    if (current.diskChanged) return false;
    if (filesSavingRef.current.has(filePath)) return false;
    filesSavingRef.current.add(filePath);
    const content = current.draft;
    const saving = { ...openFilesRef.current, [filePath]: { ...current, saveStatus: "saving" as const, saveError: undefined } };
    openFilesRef.current = saving;
    setOpenFiles(saving);
    try {
      const saved = await client.saveTextFile({
        path: filePath,
        content,
        expectedMtimeMs: current.file.mtimeMs,
        expectedContentRevision: current.file.contentRevision,
        sessionId: current.sessionId,
      });
      const existing = openFilesRef.current[filePath];
      if (!existing || existing.kind !== "text") return true;
      const needsAnotherSave = existing.draft !== content;
      const next = {
        ...openFilesRef.current,
        [filePath]: {
          ...existing,
          file: saved,
          saveStatus: needsAnotherSave ? "dirty" as const : "clean" as const,
          saveError: undefined,
        },
      };
      openFilesRef.current = next;
      setOpenFiles(next);
      if (needsAnotherSave) scheduleFileSave(filePath);
      return !needsAnotherSave;
    } catch (error) {
      const detail = errorMessage(error);
      const existing = openFilesRef.current[filePath];
      if (existing?.kind === "text") {
        const next = {
          ...openFilesRef.current,
          [filePath]: { ...existing, saveStatus: "error" as const, saveError: detail },
        };
        openFilesRef.current = next;
        setOpenFiles(next);
      }
      return false;
    } finally {
      filesSavingRef.current.delete(filePath);
    }
  }

  async function closePanelTab(tabId: string) {
    const tab = sidePanelTabs.tabs.find((candidate) => candidate.id === tabId);
    if (tab?.kind === "file") {
      const file = openFilesRef.current[tab.path];
      if (file && file.saveStatus !== "clean" && !(await saveOpenFile(tab.path))) return;
      const timer = fileSaveTimersRef.current.get(tab.path);
      if (timer !== undefined) window.clearTimeout(timer);
      fileSaveTimersRef.current.delete(tab.path);
      const next = { ...openFilesRef.current };
      if (!fileOpenInOtherSession(tab.path)) delete next[tab.path];
      openFilesRef.current = next;
      setOpenFiles(next);
    }
    setSidePanelTabs((state) => closeSidePanelTab(state, tabId));
  }

  function showFile(opened: WorkspaceFileOpenResult, line?: number, column?: number, context = { sessionId: selectedSession?.id, workspaceRoot: selectedWorkspace?.root_path || selectedSession?.working_directory }) {
      const file = opened.file;
      setSidePanelOpen(true); setDetailsOpen(false);
      const existing = openFilesRef.current[file.path];
      if (!existing || existing.kind !== "text") {
        const state: OpenFileState = opened.kind !== "text"
          ? {
              kind: opened.kind,
              file: opened.file,
              sessionId: context.sessionId,
              workspaceRoot: context.workspaceRoot,
              saveStatus: "clean",
            }
          : {
              kind: "text",
              file: opened.file,
              sessionId: context.sessionId,
              workspaceRoot: context.workspaceRoot,
              draft: opened.file.content,
              mode: isMarkdownFile(opened.file.path) ? "preview" : "source",
              saveStatus: "clean",
            };
        const next = {
          ...openFilesRef.current,
          [file.path]: state,
        };
        openFilesRef.current = next;
        setOpenFiles(next);
      }
      setSidePanelTabs((state) => openSidePanelTab(
        state,
        fileSidePanelTab(file.path, line, column),
      ));
  }

  async function handleMarkdownLinkClick(event: ReactMouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>(".markdown-copy a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) return;
    event.preventDefault();
    const fileContainer = anchor.closest<HTMLElement>("[data-markdown-file]");
    const originFile = fileContainer?.dataset.markdownFile ? openFilesRef.current[fileContainer.dataset.markdownFile] : undefined;
    const context = originFile ? { sessionId: originFile.sessionId, workspaceRoot: originFile.workspaceRoot } : { sessionId: selectedSession?.id, workspaceRoot: selectedWorkspace?.root_path || selectedSession?.working_directory };
    const expectedSessionId = selectedSession?.id ?? null;
    try {
      const result = await client.openMarkdownLink({
        href,
        basePath: fileContainer?.dataset.markdownFile
          ?? selectedSession?.working_directory
          ?? selectedWorkspace?.root_path
          ?? null,
        baseKind: fileContainer ? "file" : "directory",
        sessionId: context.sessionId,
      });
      if (result.kind === "anchor") {
        if (result.anchor.startsWith("message-") && anchor.closest("[data-message-id]") && !document.getElementById(result.anchor)) {
          await showSearchWindow(decodeURIComponent(result.anchor.slice("message-".length)));
          if (selectedSessionIdRef.current !== expectedSessionId) return;
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        document.getElementById(result.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (selectedSessionIdRef.current !== expectedSessionId) return;
      if (result.kind === "directory") { browseFiles(result.path, context); return; }
      if (result.kind !== "text" && result.kind !== "image" && result.kind !== "video") return;
      showFile(result, result.kind === "text" ? result.line : undefined, result.kind === "text" ? result.column : undefined, context);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  function renderWorkspaceNavigation(workspace: DesktopWorkspace, pinned = false) {
    const workspaceConversations = desktopState.conversations.filter(
      (conversation) => conversation.workspace_id === workspace.id && !conversation.pinned_at && (desktopState.sessionQueryVersion !== 1 || !pagedNavigation.ids(workspace.id) || pagedNavigation.ids(workspace.id)!.includes(conversation.id) || conversation.id === selectedConversation?.id),
    );
    const orderedWorkspaceIds = pinned ? pinnedKeys : desktopState.workspaces.filter((candidate) => candidate.project_id === workspace.project_id && !isNavigationPinned("workspace", candidate.id)).map((candidate) => candidate.id);
    const workspaceSort = sidebarSortProps(
      pinned ? { kind: "pinned-session", id: navigationKey({ kind: "workspace", id: workspace.id }), scopeId: "pinned" } : { kind: "workspace", id: workspace.id, scopeId: workspace.project_id },
      orderedWorkspaceIds,
    );
    const workspaceTailSort = sidebarSortProps(
      pinned ? { kind: "pinned-session", id: navigationKey({ kind: "workspace", id: workspace.id }), scopeId: "pinned" } : { kind: "workspace", id: workspace.id, scopeId: workspace.project_id },
      orderedWorkspaceIds,
      "after",
    );
    const workspaceOpen = !collapsedWorkspaceIds.has(workspace.id) || revealWorkspaceId === workspace.id;
    function toggleOpen() {
      if (revealWorkspaceId === workspace.id) {
        setSearchTarget(null);
        if (collapsedWorkspaceIds.has(workspace.id)) return;
      }
      toggleWorkspaceCollapsed(workspace.id);
    }
    return (
      <div
        data-workspace-id={workspace.id}
        className={`workspace-group ${workspaceSort.dropPosition === "after" ? "drop-after" : ""}`}
        key={workspace.id}
        onDragOver={(event) => {
          if (event.target instanceof Element && event.target.closest(".workspace-row-shell")) return;
          workspaceTailSort.onDragOver(event);
        }}
        onDrop={(event) => {
          if (event.target instanceof Element && event.target.closest(".workspace-row-shell")) return;
          workspaceTailSort.onDrop(event);
        }}
      >
        <div
          className={`workspace-row-shell ${workspaceSort.dragging ? "dragging" : ""} ${workspaceSort.dropPosition === "before" ? "drop-before" : ""}`}
          draggable={workspaceSort.draggable}
          onDragStart={workspaceSort.onDragStart}
          onDragOver={workspaceSort.onDragOver}
          onDrop={workspaceSort.onDrop}
          onDragEnd={workspaceSort.onDragEnd}
        >
          <button
            type="button"
            className="workspace-collapse-button"
            onClick={toggleOpen}
            aria-label={`${workspaceOpen ? t("common.collapse") : t("common.expand")} ${workspace.title}`}
            title={`${workspaceOpen ? t("common.collapse") : t("common.expand")} ${workspace.title}`}
            aria-expanded={workspaceOpen}
          >
            <ProjectDisclosureIcon open={workspaceOpen} />
          </button>
          <button
            type="button"
            className={`workspace-row ${workspace.id === selectedWorkspace?.id && !selectedConversation ? "selected" : ""}`}
            onClick={toggleOpen}
            aria-expanded={workspaceOpen}
            title={workspace.error}
          >
            <span>{workspace.title}</span>
          </button>
          {workspace.status !== "provisioning" && (
            <div className="workspace-row-actions">
              <button
                type="button"
                onClick={() => {
                  setProjectMenuId(null);
                  setWorkspaceMenuId((current) => current === workspace.id ? null : workspace.id);
                }}
                disabled={isBusy}
                aria-label={t("app.moreActionsFor", { p0: workspace.title })}
                aria-expanded={workspaceMenuId === workspace.id}
              >
                <MoreHorizontal size={14} strokeWidth={1.8} />
              </button>
              {workspaceMenuId === workspace.id && (
                <WorkspaceActionMenu
                  menuRef={sidebarActionMenuRef}
                  opensUp={sidebarActionMenuOpensUp}
                  pinned={pinned}
                  ready={workspace.status === "ready"}
                  kind={kind}
                  onTogglePinned={() => void toggleNavigationPinned({ kind: "workspace", id: workspace.id })}
                  onAddRepository={() => { setWorkspaceMenuId(null); void openWorkspaceSources(workspace); }}
                  onBrowseFiles={() => {
                    setWorkspaceMenuId(null);
                    browseFiles(workspace.root_path);
                  }}
                  onCopyPath={() => {
                    setWorkspaceMenuId(null);
                    void copyWorkspacePath(workspace.root_path);
                  }}
                  onRename={() => openRenameWorkspaceDialog(workspace)}
                  onArchive={() => void openArchiveWorkspaceDialog(workspace)}
                  onDelete={() => void openDeleteWorkspaceDialog(workspace)}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuId(null);
                  if (workspace.status === "error") {
                    void retryWorkspace(workspace);
                  } else {
                    void openNewConversationForWorkspace(workspace);
                  }
                }}
                disabled={isBusy}
                aria-label={workspace.status === "error" ? t("app.retry", { p0: workspace.title }) : t("app.newSessionIn", { p0: workspace.title })}
                title={workspace.status === "error" ? t("app.retryWorkspace") : t("app.newSession")}
              >
                {workspace.status === "error" ? <RefreshCw size={13} strokeWidth={1.8} /> : <SquarePen size={13} strokeWidth={1.8} />}
              </button>
            </div>
          )}
        </div>
        {(workspaceConversations.length > 0 || desktopState.sessionQueryVersion === 1) && <SidebarCollapse open={workspaceOpen}>
          <WorkspaceSessionList revealIndex={reveal?.kind === "session" && revealWorkspaceId === workspace.id ? workspaceConversations.findIndex(item => item.id === reveal.id) : -1} hasMore={pagedNavigation.hasMore(workspace.id)} onMore={() => pagedNavigation.loadMore(workspace.id)}>
            {workspaceConversations.map((conversation) => (
              <ConversationNavItem
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedConversation?.id}
                working={workingConversationIds.has(conversation.id)}
                unread={unreadConversationIds.has(conversation.id)}
                onSelect={() => void selectConversation(conversation.id)}
                onContextMenu={(event) => openConversationContextMenu(event, conversation.id)}
                onRename={() => openRenameConversationDialog(conversation)}
                onPin={() => void toggleConversationPinned(conversation)}
                onArchive={() => void archiveConversation(conversation)}
                sort={sidebarSortProps(
                  { kind: "workspace-session", id: conversation.id, scopeId: workspace.id },
                  workspaceConversations.map((candidate) => candidate.id),
                )}
              />
            ))}
          </WorkspaceSessionList>
        </SidebarCollapse>}
      </div>
    );
  }

  function renderProjectNavigation(project: DesktopProject, pinned = false) {
    const projectWorkspaces = desktopState.workspaces.filter(
      (workspace) => workspace.project_id === project.id && !isNavigationPinned("workspace", workspace.id),
    );
    const isOpen = !collapsedProjectIds.has(project.id) || revealProjectId === project.id;
    const orderedProjectIds = pinned ? pinnedKeys : desktopState.projects.filter((candidate) => !isNavigationPinned("project", candidate.id)).map((candidate) => candidate.id);
    const projectSort = sidebarSortProps(
      pinned ? { kind: "pinned-session", id: navigationKey({ kind: "project", id: project.id }), scopeId: "pinned" } : { kind: "project", id: project.id, scopeId: "projects" },
      orderedProjectIds,
    );
    const projectTailSort = sidebarSortProps(
      pinned ? { kind: "pinned-session", id: navigationKey({ kind: "project", id: project.id }), scopeId: "pinned" } : { kind: "project", id: project.id, scopeId: "projects" },
      orderedProjectIds,
      "after",
    );
    return (
      <div
        className={`project-group ${projectSort.dropPosition === "after" ? "drop-after" : ""}`}
        key={project.id}
        onDragOver={(event) => {
          if (event.target instanceof Element && event.target.closest(".project-row-shell")) return;
          projectTailSort.onDragOver(event);
        }}
        onDrop={(event) => {
          if (event.target instanceof Element && event.target.closest(".project-row-shell")) return;
          projectTailSort.onDrop(event);
        }}
      >
        <div
          className={`project-row-shell ${projectSort.dragging ? "dragging" : ""} ${projectSort.dropPosition === "before" ? "drop-before" : ""}`}
          draggable={projectSort.draggable}
          onDragStart={projectSort.onDragStart}
          onDragOver={projectSort.onDragOver}
          onDrop={projectSort.onDrop}
          onDragEnd={projectSort.onDragEnd}
        >
          <button
            type="button"
            className="project-collapse-button"
            onClick={() => toggleProjectOpen(project.id)}
            aria-label={`${isOpen ? t("common.collapse") : t("common.expand")} ${project.name}`}
            aria-expanded={isOpen}
          >
            <ProjectDisclosureIcon open={isOpen} />
          </button>
          <button
            type="button"
            className={`project-row ${project.id === projectOverviewId ? "selected" : ""}`}
            onClick={() => toggleProjectOpen(project.id)}
            aria-expanded={isOpen}
          >
            <span>{project.name}</span>
          </button>
          <div className="project-row-actions">
            <button
              type="button"
              onClick={() => {
                setWorkspaceMenuId(null);
                setProjectMenuId((current) => current === project.id ? null : project.id);
              }}
              disabled={isBusy}
              aria-label={t("app.moreActionsFor", { p0: project.name })}
              aria-expanded={projectMenuId === project.id}
            >
              <MoreHorizontal size={14} strokeWidth={1.8} />
            </button>
            {projectMenuId === project.id && (
              <ProjectActionMenu
                menuRef={sidebarActionMenuRef}
                opensUp={sidebarActionMenuOpensUp}
                pinned={pinned}
                isBusy={isBusy}
                onTogglePinned={() => void toggleNavigationPinned({ kind: "project", id: project.id })}
                onOpenOverview={() => { setProjectMenuId(null); void openProjectOverview(project); }}
                onAddSources={() => { setProjectMenuId(null); void addSourcesToProject(project.id); }}
                onRename={() => openRenameProjectDialog(project)}
                onDelete={() => void openDeleteProjectDialog(project)}
              />
            )}
            <button
              type="button"
              onClick={() => openCreateWorkspaceDialog(project)}
              disabled={isBusy}
              aria-label={t("app.newWorkspaceIn", { p0: project.name })}
              title={t("app.newWorkspace")}
            >
              <FolderPlus size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <SidebarCollapse open={isOpen}>
          <div className="workspace-list">
            {projectWorkspaces.map((workspace) => renderWorkspaceNavigation(workspace))}

        {projectWorkspaces.length === 0 && !desktopState.workspaces.some((workspace) => workspace.project_id === project.id) && (
              <button
                type="button"
                className="workspace-empty-action"
                onClick={() => openCreateWorkspaceDialog(project)}
              >
                <Plus size={13} /> {t("app.createWorkspace")}</button>
            )}
          </div>
        </SidebarCollapse>
      </div>
    );
  }

  function updateSidePanelWidth(requestedWidth: number) {
    const frame = appFrameRef.current;
    const sidebar = frame?.querySelector<HTMLElement>(".sidebar");
    if (!frame || !sidebar) return;
    const availableWidth = frame.getBoundingClientRect().width - sidebar.getBoundingClientRect().width;
    const nextWidth = clampSidePanelWidth(requestedWidth, availableWidth);
    sidePanelRatioRef.current = nextWidth / availableWidth;
    setSidePanelWidth(nextWidth);
  }

  function resizeSidePanelFromPointer(clientX: number) {
    const frame = appFrameRef.current;
    if (!frame) return;
    updateSidePanelWidth(frame.getBoundingClientRect().right - clientX);
  }

  function handleSidePanelResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsSidePanelResizing(true);
    resizeSidePanelFromPointer(event.clientX);
  }

  function handleSidePanelResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    resizeSidePanelFromPointer(event.clientX);
  }

  function finishSidePanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsSidePanelResizing(false);
  }

  function handleSidePanelResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const renderedWidth = sidePanelRef.current?.getBoundingClientRect().width ?? sidePanelWidth;
    updateSidePanelWidth(renderedWidth + (event.key === "ArrowLeft" ? 24 : -24));
  }

  const workspaceFileRoot = selectedWorkspace?.root_path || selectedSession?.working_directory || "";
  const treeLocation = directoryLocation ?? { path: workspaceFileRoot, sessionId: selectedSession?.id };
  useEffect(() => {
    fileOpenRequest.current++;
    setFileOpening(false);
  }, [workspaceFileRoot, selectedSession?.id]);

  function showPanelTab(tab: SidePanelTab) {
    setSidePanelOpen(true); setDetailsOpen(false);
    setSidePanelTabs((state) => openSidePanelTab(state, tab));
  }

  function browseFiles(path = workspaceFileRoot, context = { sessionId: selectedSession?.id }) {
    fileOpenRequest.current++; setFileOpening(false);
    setDirectoryLocation({ path, sessionId: context.sessionId }); setTreeVisible(true); setWebNavigationOpen(false);
    setSidePanelOpen(true); setDetailsOpen(false);
    setSidePanelTabs((state) => ({ ...state, activeTabId: null }));
    window.requestAnimationFrame(() => appFrameRef.current?.querySelector<HTMLInputElement>('[data-file-filter]')?.focus());
  }

  async function openTreeFile(path: string, context = treeLocation) {
    const request = ++fileOpenRequest.current;
    setFileOpening(true);
    try {
      const sessionId = context.sessionId;
      const opened = await client.openFile(path, sessionId);
      if (request === fileOpenRequest.current) showFile(opened, undefined, undefined, { sessionId, workspaceRoot: context.path });
    } catch (error) {
      if (request === fileOpenRequest.current) toast(errorMessage(error), "error");
    } finally { if (request === fileOpenRequest.current) setFileOpening(false); }
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing || document.querySelector("dialog[open], [aria-modal=true]")) return;
      if (!sidePanelSurface) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault(); browseFiles();
      } else if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === "KeyB") {
        event.preventDefault(); setSidePanelOpen((open) => !open); setDetailsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidePanelSurface, workspaceFileRoot, selectedSession?.id]);

  const activeSidePanelTab = sidePanelTabs.tabs.find((tab) => tab.id === sidePanelTabs.activeTabId) ?? null;
  const liveFiles = useLiveFiles(client, openFiles, openFilesRef, setOpenFiles,
    sidePanelOpen && sidePanelSurface && activeSidePanelTab?.kind === "file" ? activeSidePanelTab.path : undefined,
    hostSwitchingRef);

  return (
    <MarkdownImageContext.Provider value={markdownImageContext}>
    <CompletionTriggerNavigation.Provider value={triggerId => showPanelTab({ id: "notifications", kind: "notifications", triggerId })}>
    <SubagentNavigation.Provider value={subagentNavigation}>
    <main
      ref={appFrameRef}
      className={`app-frame ${isSidebarResizing ? "resizing-sidebar" : ""} ${channelsOpen ? "channels-mode" : ""} ${repositoriesOpen ? "repositories-mode" : ""} ${webNavigationOpen ? "web-navigation-open" : ""} ${sidePanelSurface && sidePanelOpen ? "has-subagent-panel" : ""} ${sidePanelSurface && sidePanelExpanded ? "side-panel-expanded" : ""} ${sidePanelSurface && isSidePanelResizing ? "resizing-side-panel" : ""}`}
      style={{ "--preferred-sidebar-width": `${sidebarWidth}px`, "--side-panel-width": `${sidePanelWidth}px` } as React.CSSProperties}
      onClickCapture={(event) => void handleMarkdownLinkClick(event)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && detailsOpen) setDetailsOpen(false);
        if (event.key === "Escape" && webNavigationOpen && !(event.target as Element).closest("dialog")) {
          event.preventDefault(); setWebNavigationOpen(false);
        }
      }}
    >
      {searchOpen && <SearchPalette state={desktopState} client={desktopState.sessionQueryVersion === 1 ? client : undefined} onPage={page => setDesktopState(current => mergeSessionPage(current, page))} onClose={() => setSearchOpen(false)} onSelect={revealSession} onSelectWorkspace={revealWorkspace} onNewConversation={() => void openNewConversation()} onNewProject={openCreateProjectDialog} />}
      <aside className="sidebar">
        <SidebarResizeHandle frameRef={appFrameRef} width={sidebarWidth} onWidth={setSidebarWidth} onResizing={setIsSidebarResizing} />
        <div className="sidebar-chrome" aria-hidden="true">
          <PanelLeft size={14} strokeWidth={1.8} />
          <ArrowLeft size={14} strokeWidth={1.8} />
          <ArrowRight size={14} strokeWidth={1.8} />
        </div>

        <div className="sidebar-brand">
          <HostMenu />
          <div className="brand-actions">
            <button type="button" className="locate-selection" aria-label={t("app.locateSelection")} title={t("app.locateSelection")} disabled={!selectedConversation && !selectedWorkspace} onClick={revealCurrentSelection}><Crosshair size={15} strokeWidth={1.8} /></button>
            <button type="button" aria-label={t("app.search")} onClick={() => setSearchOpen(true)} title={t("app.searchKCtrlK")}><Search size={15} strokeWidth={1.8} /></button>
            <button type="button" className="recent-sessions-toggle" aria-label={t("recentSessions.title")} aria-pressed={recentSessionsOpen && !channelsOpen && !repositoriesOpen} title={t("recentSessions.title")} onClick={() => showRecentSessions(!(recentSessionsOpen && !channelsOpen && !repositoriesOpen))}><Bell size={15} strokeWidth={1.8} /></button>
            {kind === "web" && <button ref={webNavigationCloseButton} className="web-navigation-toggle sidebar-navigation-close" type="button" onClick={() => setWebNavigationOpen(false)} aria-label={t("app.closeNavigation")} title={t("app.closeNavigation")}><X size={18} /></button>}
          </div>
        </div>

        <SidebarUtilityNav
          channelsOpen={channelsOpen}
          repositoriesOpen={repositoriesOpen}
          channelsEntryButton={channelsEntryButton}
          onHome={() => { showRecentSessions(false); setWebNavigationOpen(false); }}
          onChannels={() => { openChannels(); setProjectOverviewId(null); setWebNavigationOpen(false); setConversationContextMenu(null); setDetailsOpen(false); setSidePanelOpen(false); }}
          onRepositories={() => { leaveChannelsImmediately(); setRepositoriesOpen(true); setWebNavigationOpen(false); setConversationContextMenu(null); setDetailsOpen(false); setSidePanelOpen(false); }}
        />

        <button className="sidebar-new-session" type="button" onClick={() => void openNewConversation()} disabled={isBusy}>
          <SquarePen size={16} strokeWidth={1.8} /><span>{t("app.newSession")}</span>
        </button>

        <div className="sidebar-lower-stack">
        <div ref={navigationScrollRef} className={`sidebar-default-navigation ${channelsSidebarActive ? "is-hidden" : ""}`} inert={channelsOpen}>
        {recentSessionsOpen ? <RecentSessions workingIds={workingConversationIds} state={desktopState.sessionQueryVersion === 1 ? { ...desktopState, conversations: desktopState.conversations.filter(item => pagedNavigation.activityIDs.has(item.id)) } : desktopState} sessions={sessions} more={pagedNavigation.activityMore} onMore={pagedNavigation.loadActivityMore} error={pagedNavigation.error} onSearch={() => setSearchOpen(true)} renderItem={({ conversation, context, unread }) => <ConversationNavItem
          key={conversation.id} conversation={conversation} detail={context || t("app.ungroupedSessions")}
          selected={conversation.id === selectedConversation?.id} working={workingConversationIds.has(conversation.id)} unread={unread}
          onSelect={() => void selectConversation(conversation.id)} onContextMenu={event => openConversationContextMenu(event, conversation.id)}
          onRename={() => openRenameConversationDialog(conversation)} onPin={() => void toggleConversationPinned(conversation)} onArchive={() => void archiveConversation(conversation)}
        />} /> : <>
        <SidebarSection name="pinned" reveal={revealSection === "pinned"} dismissReveal={revealSection === "pinned" ? () => setSearchTarget(null) : undefined} title={t("app.pinned")}>
          {pinnedItems.length === 0 ? (
            <p className="sidebar-empty">{t("app.noPinnedItems")}</p>
          ) : (
            <div className="sidebar-session-list">
              {pinnedItems.map((item) => {
                if (item.kind === "project") return renderProjectNavigation(desktopState.projects.find((project) => project.id === item.id)!, true);
                if (item.kind === "workspace") return renderWorkspaceNavigation(desktopState.workspaces.find((workspace) => workspace.id === item.id)!, true);
                const conversation = desktopState.conversations.find((candidate) => candidate.id === item.id)!;
                return <ConversationNavItem
                  key={navigationKey(item)}
                  conversation={conversation}
                  selected={conversation.id === selectedConversation?.id}
                  working={workingConversationIds.has(conversation.id)}
                  unread={unreadConversationIds.has(conversation.id)}
                  onSelect={() => void selectConversation(conversation.id)}
                  onContextMenu={(event) => openConversationContextMenu(event, conversation.id)}
                  onRename={() => openRenameConversationDialog(conversation)}
                  onPin={() => void toggleConversationPinned(conversation)}
                  onArchive={() => void archiveConversation(conversation)}
                  sort={sidebarSortProps({ kind: "pinned-session", id: navigationKey(item), scopeId: "pinned" }, pinnedKeys)}
                />;
              })}
            </div>
          )}
          {pagedNavigation.hasMore("pinned") && <button className="workspace-sessions-more" onClick={() => pagedNavigation.loadMore("pinned")}>{t("conversationTimeline.showMore")}</button>}
        </SidebarSection>

        <SidebarSection name="projects" reveal={revealSection === "projects"} dismissReveal={revealSection === "projects" ? () => setSearchTarget(null) : undefined} title={t("app.projects")} actions={
          <>
          <button type="button" onClick={openCreateProjectDialog} disabled={isBusy} aria-label={t("app.addProject")}>
            <FolderPlus size={15} strokeWidth={1.8} />
          </button>
          </>
        }>
          {desktopState.projects.length === 0 ? (
            <p className="sidebar-empty">{t("app.noProjectsYet")}</p>
          ) : (
            desktopState.projects.filter((project) => !isNavigationPinned("project", project.id)).map((project) => renderProjectNavigation(project))
          )}
        </SidebarSection>

        {ungroupedConversations.length > 0 && (
          <SidebarSection name="ungrouped" reveal={revealSection === "ungrouped"} dismissReveal={revealSection === "ungrouped" ? () => setSearchTarget(null) : undefined} title={t("app.ungroupedSessions")}>
            <div className="sidebar-session-list">
            {ungroupedConversations.map((conversation) => (
              <ConversationNavItem
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedConversation?.id}
                working={workingConversationIds.has(conversation.id)}
                unread={unreadConversationIds.has(conversation.id)}
                onSelect={() => void selectConversation(conversation.id)}
                onContextMenu={(event) => openConversationContextMenu(event, conversation.id)}
                onRename={() => openRenameConversationDialog(conversation)}
                onPin={() => void toggleConversationPinned(conversation)}
                onArchive={() => void archiveConversation(conversation)}
              />
            ))}
            </div>
          {pagedNavigation.hasMore("ungrouped") && <button className="workspace-sessions-more" onClick={() => pagedNavigation.loadMore("ungrouped")}>{t("conversationTimeline.showMore")}</button>}
          </SidebarSection>
        )}

        </>}

        {!recentSessionsOpen && pagedNavigation.error && <p role="alert" className="sidebar-empty">{pagedNavigation.error}</p>}
        {sidebarActionError && (
          <div className="sidebar-action-error" role="alert">
            <ShieldAlert size={14} strokeWidth={1.8} />
            <span>{sidebarActionError}</span>
            <button type="button" onClick={() => setSidebarActionError(null)} aria-label={t("app.dismissArchiveError")}>
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        )}
        </div>
        <div ref={setChannelsSidebarRoot} className={`channels-sidebar-root ${channelsSidebarActive ? "is-active" : ""}`} />
        </div>

        <div className="sidebar-footer">
          <img className="user-chip" src="./brand/zotigo-sprite.png" alt="" aria-hidden="true" />
          <div>
            <strong>{t("app.zotigo")}</strong>
            <span>{connectionLabel(connectionState)}</span>
          </div>
          {signOut && <button type="button" onClick={() => void signOut().catch((error) => setMessage(errorMessage(error)))}>{t("app.signOut")}</button>}
        </div>
      </aside>

      {conversationContextMenu && contextMenuConversation && (
        <SessionContextMenu
          x={conversationContextMenu.x}
          y={conversationContextMenu.y}
          unread={unreadConversationIds.has(contextMenuConversation.id)}
          pinned={Boolean(contextMenuConversation.pinned_at)}
          isBusy={isBusy}
          onToggleRead={() => {
            const conversationId = contextMenuConversation.id;
            if (unreadConversationIds.has(conversationId)) markConversationRead(conversationId);
            else markConversationUnread(conversationId);
            setConversationContextMenu(null);
          }}
          onTogglePinned={() => {
            setConversationContextMenu(null);
            void toggleConversationPinned(contextMenuConversation);
          }}
          onFork={() => {
            setConversationContextMenu(null);
            void forkConversation(contextMenuConversation.id);
          }}
          onRename={() => {
            setConversationContextMenu(null);
            openRenameConversationDialog(contextMenuConversation);
          }}
          onArchive={() => {
            setConversationContextMenu(null);
            void archiveConversation(contextMenuConversation);
          }}
        />
      )}

      {channelsOpen && channelsSidebarRoot && <ChannelsPage favorites={savedModelFavorites} hostName={hostName} projects={desktopState.projects} workspaces={desktopState.workspaces} agents={runtimeAgents} sessions={sessions} sessionCatalog={desktopState.conversations} navigationRoot={channelsSidebarRoot} navigationButtonRef={channelsNavigationButton} navigationOpen={webNavigationOpen} sessionVisible={channelsSessionVisible} selectedSessionId={selectedSession?.id} onOpenNavigation={() => setWebNavigationOpen(true)} onShowConfiguration={() => setChannelsSessionVisible(false)} onBack={closeChannels} onOpenSession={async (id, leaveChannels) => {
        const request = ++channelsNavigationRequest.current;
        let state: DesktopState;
        let page: SessionPage | null;
        try {
          ({ state, page } = await loadSessionIntoState(await client.getDesktopState(), id, client.querySessions));
        } catch (error) {
          if (request !== channelsNavigationRequest.current) return;
          throw error;
        }
        if (request !== channelsNavigationRequest.current) return;
        applyDesktopState(state);
        if (page) mergeLoadedSessions(page.sessions);
        const binding = state.bindings.find((value) => value.daemon_session_id === id);
        if (!binding || !state.conversations.some((value) => value.id === binding.conversation_id)) {
          throw new Error(t("app.theBoundSessionIsNotAvailableInThis"));
        }
        if (request !== channelsNavigationRequest.current) return;
        selectConversation(binding.conversation_id, state, !leaveChannels);
        setChannelsSessionVisible(!leaveChannels);
        setWebNavigationOpen(false);
      }} />}

      {repositoriesOpen && <section className="conversation repository-page" aria-label={t("repositories.library")}>
        <header className="conversation-titlebar">
          {kind === "web" && <button ref={repositoriesNavigationButton} className="web-navigation-toggle" type="button" onClick={() => setWebNavigationOpen(true)} aria-label={t("app.openNavigation")} aria-expanded={webNavigationOpen}><PanelLeft size={18} /></button>}
          <div className="title-with-icon"><GitBranch size={16} /><h1>{t("repositories.library")}</h1></div>
          <div className="repository-page-host"><HostMenu /></div>
        </header>
        <div className="repository-page-scroll"><div className="repository-page-content"><ManagedRepositoryPicker client={client} /></div></div>
      </section>}

      <section hidden={repositoriesOpen || (channelsOpen && !channelsSessionVisible)} className={`conversation ${selectedConversation ? "has-composer" : ""}`}>
        <header className="conversation-titlebar">
          {kind === "web" && <button ref={webNavigationButton} className="web-navigation-toggle" type="button" onClick={() => setWebNavigationOpen(true)} aria-label={t("app.openNavigation")} aria-expanded={webNavigationOpen}><PanelLeft size={18} /></button>}
          {selectedConversation ? (
            <ConversationTitle
              title={selectedConversation.title}
              isEditing={isEditingConversationTitle}
              draft={conversationTitleDraft}
              isSaving={isSavingConversationTitle}
              inputRef={conversationTitleInputRef}
              onDraftChange={setConversationTitleDraft}
              onSave={() => void saveConversationTitle(selectedConversation)}
              onCancel={() => cancelConversationTitleEdit(selectedConversation)}
              onBeginEdit={() => beginConversationTitleEdit(selectedConversation)}
            />
          ) : null}
          <div className="workspace-panel-actions">
            {selectedBinding && <ConversationTools
              key={clientScope + ":" + selectedBinding.daemon_session_id}
              root={conversationScrollRef}
              language={translationLanguage}
              references={activeComposerDraft.references ?? []}
              editingId={editingReferenceId}
              onEdit={setEditingReferenceId}
              onReferencesChange={references => updateComposerDraft(composerDraftKey, current => ({ ...current, references }))}
              onSearch={() => { conversationFindOpen.current = true; cancelScheduledConversationAutoScroll(); setStickToBottom(false); }}
              items={timelineItems}
              search={query => client.searchSession(selectedBinding.daemon_session_id, query)}
              showHit={async (hit, signal) => { await showSearchWindow(hit.sequence, signal); }}
              onCloseSearch={() => { conversationFindOpen.current = false; closeSearchWindow(); }}
              translationProfile={translationProfile}
              translate={(text, language) => client.translateSelection(selectedBinding.daemon_session_id, text, language, translationProfile || undefined)}
              onReference={reference => {
                updateComposerDraft(composerDraftKey, current => ({ ...current, references: [...(current.references ?? []), reference] }));
                setEditingReferenceId(reference.id);
              }}
            />}
            <button type="button" className="icon-button" aria-label={t("app.sessionDetails")} aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}><ListFilter size={17} /></button>
            {!sidePanelOpen && <button type="button" className="icon-button" aria-label={t("app.toggleSidePanel")} title={t("app.toggleSidePanelBCtrlAltB")} aria-expanded={sidePanelOpen} onClick={() => { setSidePanelOpen((open) => !open); setDetailsOpen(false); }}><PanelRight size={17} /></button>}
          </div>
        </header>

        <div
          ref={conversationScrollRef}
          className={`conversation-scroll ${selectedConversation ? "" : "new-chat-scroll"}`}
          tabIndex={selectedConversation ? 0 : undefined}
          aria-label={selectedConversation ? t("app.conversationHistory") : undefined}
          onScroll={handleConversationScroll}
          onWheel={handleConversationWheel}
          onKeyDown={handleConversationKeyDown}
          onTouchStart={handleConversationTouchStart}
          onTouchMove={handleConversationTouchMove}
          onTouchEnd={handleConversationTouchEnd}
          onTouchCancel={handleConversationTouchEnd}
        >
          {searchWindow && <div className="search-history-notice">{t("app.showingMessagesNearASearchResult")}{" "}<button type="button" onClick={closeSearchWindow}>{t("app.returnToConversation")}</button></div>}
          <article className={`conversation-body${!selectedConversation && newPromptPreview?.draftKey === composerDraftKey ? " has-prompt-preview" : ""}`}>
            {showNewPromptPreview && (
              <>
                <UserMessage
                  text={displayContentText(newPromptPreview.item.content)}
                  delivery={newPromptPreview.item.delivery}
                  onRestore={() => newPromptRecovery.current?.restore()}
                  onDismiss={() => newPromptRecovery.current?.discard()}
                />
                {newPromptPreview.item.delivery?.state === "failed" && (
                  <div className="message-delivery">
                    <span>{t(newPromptPreview.sessionCreated ? "app.checkConversationBeforeRestoringMessageMayHaveArrived" : "app.checkSessionsBeforeRestoringCreationMayHaveSucceeded")}</span>
                    <button type="button" onClick={() => newPromptRecovery.current?.restore()}>{t("app.restoreDraft")}</button>
                    <button type="button" onClick={() => newPromptRecovery.current?.discard()}>{t("app.dismiss")}</button>
                  </div>
                )}
              </>
            )}
            {selectedConversation ? (
              <SessionTimeline
                onRetryPrompt={(id) => { if (!isBusy) void promptRetries.current.get(id)?.(); }}
                onRestorePrompt={(id) => { if (!isBusy) promptRecovery.current.get(id)?.restore(); }}
                onDismissPrompt={(id) => { if (!isBusy) promptRecovery.current.get(id)?.discard(); }}
                hasPendingPrompt={showNewPromptPreview}
                onFork={timelineActions.onFork}
                forkBusy={isBusy}
                forkSourceTitle={forkSourceConversation?.title}
                onOpenForkSource={timelineActions.onOpenForkSource}
                binding={selectedBinding}
                session={selectedSession}
                items={searchWindow ?? timelineItems}
                interactionHistory={actionableSessionItems}
                itemsAuthoritative={sessionItemsLoadedForSessionId === selectedBinding?.daemon_session_id}
                itemsLoading={sessionItemsLoading}
                itemsError={sessionItemsError}
                message={message}
                daemonUrl={daemonUrl}
                thinkingDisplay={selectedSession?.agent === "codex" ? undefined : thinkingDisplay}
                streamingItemIds={streamingItemIds}
                smoothStreaming={shouldSmoothStreaming(selectedSession?.agent, true)}
                submittingApprovalIds={submittingApprovalIds}
                onSubmitApproval={submitApproval}
                submittingInteractionIds={submittingInteractionIds}
                onSubmitInteraction={submitInteraction}
              />
            ) : projectOverviewId && selectedProject ? (
              <ProjectOverview
                project={selectedProject}
                state={desktopState}
                message={message}
                onAddSources={() => void addSourcesToProject(selectedProject.id)}
                onRename={() => openRenameProjectDialog(selectedProject)}
                onRemoveSource={(kind, id, name) => { setMessage(null); setRemoveSourceTarget({ kind, id, name }); }}
                onCreateWorkspace={() => openCreateWorkspaceDialog(selectedProject)}
                onManageWorkspaceSources={(workspace) => void openWorkspaceSources(workspace)}
                onOpenPath={browseFiles}
              />
            ) : (
              <NewSessionPrompt
                onConfigureModels={onConfigureModels}
                favorites={modelFavorites}
                selectedProject={selectedProject}
                selectedWorkspace={selectedWorkspace}
                requiresWorkspace={Boolean((selectedProject || selectedWorkspace) && selectedWorkspace?.status !== "ready")}
                message={message}
                isBusy={isBusy || attachmentsBlocked}
                prompt={activePrompt}
                skills={skillMatches}
                selectedSkillNames={selectedSkillNames}
                skillsLoading={skillsLoading}
                skillsError={skillsError}
                skillMenuOpen={skillMenuOpen}
                skillMenuIndex={skillMenuIndex}
                attachments={composerAttachments}
                editorKey={composerDraftKey}
                onCaretChange={setPromptCaret}
                onPromptChange={updateActivePrompt}
                onPromptKeyDown={handleNewPromptKeyDown}
                onSelectSkill={selectComposerSkill}
                onHighlightSkill={setSkillMenuIndex}
                onPromptPaste={handleComposerPaste}
                onPreviewAttachment={previewComposerAttachment}
                onRemoveAttachment={removeComposerAttachment}
                onAddAttachment={openAttachmentPicker}
                onCreate={(prompt) => void createConversation(prompt)}
                onSelectProject={(projectId) => void selectProject(projectId)}
                onSelectWorkspace={(workspaceId) => void selectWorkspace(workspaceId)}
                onCreateProject={openCreateProjectDialog}
                onCreateWorkspace={openCreateWorkspaceDialog}
                projects={desktopState.projects}
                workspaces={desktopState.workspaces}
                profiles={profiles}
                selectedProfile={selectedProfile}
                profilesLoading={profilesLoading}
                onSelectProfile={(profile) => void selectProfile(selectedSession, selectedBinding, profile)}
                agents={runtimeAgents}
                agentsLoading={runtimeAgentsLoading}
                selectedAgent={selectedAgent}
                onSelectAgent={selectAgent}
                codexModels={codexModels}
                selectedCodexModel={selectedCodexModel}
                selectedCodexReasoningEffort={selectedCodexReasoningEffort}
                onSelectCodexModel={selectCodexModel}
                onSelectCodexReasoningEffort={(reasoningEffort) => rememberModelSelection({ agent: "codex", model: draftCodexModel, reasoningEffort })}
                selectedApprovalPolicy={draftApprovalPolicy}
                onSelectApprovalPolicy={(approvalPolicy) => void selectApprovalPolicy(selectedSession, selectedBinding, approvalPolicy)}
                runtimeAvailable={true}
              />
            )}
          </article>
        </div>

        {selectedConversation && !isConversationAtBottom && (
          <button
            type="button"
            className="scroll-to-bottom-button"
            aria-label={t("app.scrollToLatestMessage")}
            onClick={() => { if (searchWindow) { closeSearchWindow(); requestAnimationFrame(() => scrollConversationToBottom({ smooth: true })); } else scrollConversationToBottom({ smooth: true }); }}
          >
            <ArrowDown size={17} strokeWidth={2} />
          </button>
        )}

        {selectedConversation && (
          <div className="composer-shell">
            <PendingInteractionNotice items={actionableSessionItems} onOpen={(id) => {
              closeSearchWindow();
              stickToBottomRef.current = false;
              requestAnimationFrame(() => {
                const card = document.getElementById(`interaction-${id}`);
                card?.scrollIntoView({ block: "center", behavior: "smooth" });
                card?.focus({ preventScroll: true });
              });
            }} />
            {selectedBinding && <InputQueue onReconciled={(ids) => { setOptimisticPromptItems(current => current.filter(item => !ids.includes(item.id))); for (const id of ids) { promptRetries.current.delete(id); promptRecovery.current.get(id)?.release(); promptRecovery.current.delete(id); } }} pending={optimisticPromptItems.filter(item => item.queuedPreview)} onRetry={(id) => { if (!isBusy) void promptRetries.current.get(id)?.(); }} onRestore={(id) => { if (!isBusy) promptRecovery.current.get(id)?.restore(); }} onDismiss={(id) => { if (!isBusy) promptRecovery.current.get(id)?.discard(); }} daemonUrl={daemonUrl} key={clientScope + ":" + selectedBinding.daemon_session_id} client={client} sessionId={selectedBinding.daemon_session_id} refresh={queueRefresh} active={surfaceActive} />}
            {runtimeOccupied && (
              <div className="runtime-occupied-notice" role="status">
                <ShieldAlert size={18} strokeWidth={1.9} />
                <div>
                  <strong>{t("app.thisTaskIsOpenInCodex")}</strong>
                  <span>{t("app.exitItThereAndReturnHereToContinue")}</span>
                </div>
                <button type="button" onClick={() => void retryRuntimeOccupiedSession()} disabled={isBusy}>
                  {isBusy ? t("app.checking") : t("app.checkAgain")}
                </button>
              </div>
            )}
            <form className="composer" onSubmit={(event) => void submitSelectedPrompt(event)}>
              <ComposerReferences onEdit={id => { void editReference(id); }} references={activeComposerDraft.references ?? []} onChange={references => updateComposerDraft(composerDraftKey, current => ({ ...current, references }))} />
              <ComposerSkills
                skills={skillMatches}
                selectedSkillNames={selectedSkillNames}
                loading={skillsLoading}
                error={skillsError}
                open={skillMenuOpen}
                activeIndex={skillMenuIndex}
                onSelect={selectComposerSkill}
                onHighlight={setSkillMenuIndex}
              />
              <ComposerAttachmentStrip
                attachments={composerAttachments}
                onPreview={previewComposerAttachment}
                onRemove={removeComposerAttachment}
              />
              <SkillPromptEditor
                key={composerDraftKey}
                skills={selectedSkillNames}
                onCaretChange={setPromptCaret}
                onHeightChange={() => { if (stickToBottomRef.current) scheduleConversationScrollToBottom(); }}
                ref={composerTextareaRef}
                value={activePrompt}
                onChange={updateActivePrompt}
                onKeyDown={handleComposerKeyDown}
                onPaste={handleComposerPaste}
                placeholder={t("app.askFollowUpChanges")}
              />
              <div className="composer-actions">
                <div className="composer-actions-left">
                  <AttachmentMenu key={composerDraftKey} onPick={openAttachmentPicker} disabled={isBusy}
                    alternateSend={{
                      label: defaultSendMode === "steering" ? t("app.queueForNextTurn") : t("app.sendAsSteering"),
                      disabled: !canSubmitSelectedPrompt,
                      onSend: (form) => {
                        submitModeRef.current = alternateSendMode(defaultSendMode);
                        form.requestSubmit();
                      },
                    }}
                  />
                  <ApprovalPolicyPicker
                    value={selectedApprovalPolicy}
                    onChange={(approvalPolicy) => void selectApprovalPolicy(selectedSession, selectedBinding, approvalPolicy)}
                    disabled={isBusy || hasActiveTurn || selectedApprovalPolicy === null}
                  />
                </div>
                <div className="composer-actions-right">
                  {selectedAgent === "codex" ? (
                    <RuntimeSettingsPicker
                      favorites={modelFavorites}
                      agents={codexAgent ? [codexAgent] : []}
                      selectedAgent="codex"
                      onSelectAgent={selectAgent}
                      profiles={[]}
                      selectedProfile=""
                      onSelectProfile={() => {}}
                      codexModels={codexModels}
                      selectedCodexModel={selectedCodexModel}
                      onSelectCodexModel={(model) => {
                        const selectedModel = codexModels.find((candidate) => candidate.id === model);
                        void selectSessionCodexSettings(
                          model,
                          compatibleReasoningEffort(
                            selectedModel?.supported_reasoning_efforts ?? [],
                            selectedCodexReasoningEffort,
                          ),
                        );
                      }}
                      selectedCodexReasoningEffort={selectedCodexReasoningEffort}
                      onSelectCodexReasoningEffort={(effort) => void selectSessionCodexSettings(selectedCodexModel, effort)}
                      agentLocked
                      disabled={isBusy || hasActiveTurn || codexModels.length === 0}
                    />
                  ) : (
                    <RuntimeSettingsPicker
                      favorites={modelFavorites}
                      agents={runtimeAgents}
                      selectedAgent="zotigo"
                      onSelectAgent={() => {}}
                      profiles={profiles}
                      selectedProfile={selectedProfile}
                      onSelectProfile={(profile) => void selectProfile(selectedSession, selectedBinding, profile)}
                      codexModels={[]}
                      selectedCodexModel=""
                      onSelectCodexModel={() => {}}
                      selectedCodexReasoningEffort=""
                      onSelectCodexReasoningEffort={() => {}}
                      agentLocked
                      disabled={isBusy || profilesLoading || profiles.length === 0}
                    />
                  )}
                  {selectedSession?.context_usage && (
                    <ContextUsageBadge usage={selectedSession.context_usage} />
                  )}
                  {showStopControl ? (
                    <button
                      type="button"
                      className="send-button stop"
                      aria-label={pauseRequestedTurnId === selectedActiveTurnId ? t("app.stopRequested") : t("app.stopRunningTurn")}
                      disabled={pauseRequestedTurnId === selectedActiveTurnId}
                      onClick={() => void requestStopSelectedTurn()}
                    >
                      <Square size={12} strokeWidth={2.2} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="send-button"
                      disabled={!canSubmitSelectedPrompt}
                      aria-label={t("app.sendMessage")}
                      title={defaultSendMode === "steering" ? t("app.sendAsSteeringEnterCtrlEnterToQueue") : t("app.queueForNextTurnEnterCtrlEnterTo")}
                    >
                      <ArrowUp size={16} strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        )}

              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                hidden
                onChange={handleAttachmentInputChange}
              />
        {previewAttachment && previewAttachment.kind !== "image" && (
          <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachmentId(null)} />
        )}
        {previewAttachment?.kind === "image" && previewAttachment.url && (
          <ImagePreview key={previewAttachment.url} src={previewAttachment.url} alt={previewAttachment.name} onClose={() => setPreviewAttachmentId(null)} />
        )}
      </section>

      {detailsOpen && !channelsOpen && !repositoriesOpen && <SessionInspector isBusy={isBusy} onClose={() => setDetailsOpen(false)} onRefresh={() => void refreshSessions({ syncCodex: true })}>
          <SessionEnvironmentList
            connectionState={connectionState}
            remote={remote}
            projectName={selectedProject?.name}
            workspace={selectedWorkspace}
            workingDirectory={selectedSession?.working_directory}
            copiedWorkspacePath={copiedWorkspacePath}
            onCopyPath={(path) => void copyWorkspacePath(path)}
            onBrowseFiles={(path) => browseFiles(path)}
          />

          {subagentRuns.length > 0 && (
            <>
              <div className="inspector-divider" />
              <SubagentSummaryButton runs={subagentRuns} onOpen={() => showPanelTab({ id: "subagents", kind: "subagents" })} />
            </>
          )}

          {selectedConversation && (
            <>
              <div className="inspector-divider" />
              <div className="inspector-subheading">
                <span>{t("app.session")}</span>
                <button type="button" className="icon-button" onClick={() => void toggleConversationPinned(selectedConversation)} aria-label={selectedConversation.pinned_at ? t("app.unpinSession") : t("app.pinSession")}>
                  <Pin size={14} strokeWidth={1.8} fill={selectedConversation.pinned_at ? "currentColor" : "none"} />
                </button>
              </div>
              <SessionDetailList
                conversation={selectedConversation}
                projects={desktopState.projects}
                binding={selectedBinding}
                session={selectedSession}
                sessionItemsLoading={sessionItemsLoading}
                hasActiveTurn={hasActiveTurn}
                agent={selectedAgent}
                codexModels={codexModels}
                codexModel={selectedCodexModel}
                codexReasoningEffort={selectedCodexReasoningEffort}
                profile={selectedProfile}
                approvalPolicy={selectedApprovalPolicy}
              />
            </>
          )}
      </SessionInspector>}

      {(
        <aside inert={!sidePanelSurface || !sidePanelOpen} aria-hidden={!sidePanelSurface || !sidePanelOpen} ref={sidePanelRef} className="subagent-side-panel" aria-label={t("app.sidePanel")}>
          <div
            className="side-panel-resize-handle"
            role="separator"
            aria-label={t("app.resizeSidePanel")}
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={handleSidePanelResizePointerDown}
            onPointerMove={handleSidePanelResizePointerMove}
            onPointerUp={finishSidePanelResize}
            onPointerCancel={finishSidePanelResize}
            onLostPointerCapture={() => setIsSidePanelResizing(false)}
            onKeyDown={handleSidePanelResizeKeyDown}
          />
          {activeSidePanelTab?.kind === "file" && <MobileFileNavigation path={activeSidePanelTab.path}
            onBack={() => {
              const file = openFiles[activeSidePanelTab.path];
              const path = activeSidePanelTab.path.replace(/\\/g, "/");
              const parent = path.slice(0, path.lastIndexOf("/")) || "/";
              browseFiles(/^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent, { sessionId: file?.sessionId });
            }}
            onClose={() => setSidePanelOpen(false)} />}
          <div className={`subagent-panel-tabbar ${activeSidePanelTab?.kind === "file" ? "file-tabbar" : ""}`}>
            <div className="workspace-panel-tabs">
              <div className={`subagent-panel-tab ${!activeSidePanelTab && !treeVisible ? "active" : ""}`}>
                <button type="button" className="subagent-panel-tab-select" aria-pressed={!activeSidePanelTab && !treeVisible} onClick={() => { setTreeVisible(false); setSidePanelTabs(state => ({ ...state, activeTabId: null })); }}>
                  <LayoutGrid size={14} /><span>{t("panel.tools")}</span>
                </button>
              </div>
            {sidePanelTabs.tabs.map((tab) => {
              const run = tab.kind === "subagent" ? subagentRuns.find((candidate) => candidate.id === tab.runId) : undefined;
              const fileState = tab.kind === "file" ? openFiles[tab.path] : undefined;
              const label = tab.kind === "notifications" ? t("completionTriggers.title") : tab.kind === "subagents" ? t("app.subagents") : tab.kind === "file" ? fileNameForPath(tab.path) : run?.name ?? t("app.subagent");
              return (
                <div key={tab.id} className={`subagent-panel-tab ${sidePanelTabs.activeTabId === tab.id ? "active" : ""}`}>
                  <button type="button" className="subagent-panel-tab-select" onClick={() => setSidePanelTabs((state) => openSidePanelTab(state, tab))}>
                    {tab.kind === "notifications" ? <Bell size={14} /> : tab.kind === "file" ? fileState?.kind === "image" ? <Image size={14} strokeWidth={1.8} /> : <FileText size={14} strokeWidth={1.8} /> : run ? <SubagentAvatar run={run} compact /> : <Circle size={14} strokeWidth={2} fill="currentColor" />}
                    <span>{label}</span>
                  </button>
                  <button type="button" className="subagent-panel-tab-close" aria-label={t("app.close", { p0: label })} onClick={() => void closePanelTab(tab.id)}>
                    <X size={14} strokeWidth={1.9} />
                  </button>
                </div>
              );
            })}
            </div>
            {subagentRuns.length > 0 && <button type="button" className="icon-button" aria-label={t("app.subagents")} onClick={() => showPanelTab({ id: "subagents", kind: "subagents" })}><Circle size={16} /></button>}
            <div className="workspace-panel-actions">
              <button type="button" className="icon-button" title={(!activeSidePanelTab || activeSidePanelTab.kind === "file") ? t("app.toggleFileTree") : t("app.browseFiles")} aria-label={(!activeSidePanelTab || activeSidePanelTab.kind === "file") ? t("app.toggleFileTree") : t("app.browseFiles")} aria-expanded={(!activeSidePanelTab || activeSidePanelTab.kind === "file") ? treeVisible : undefined} onClick={() => (!activeSidePanelTab || activeSidePanelTab.kind === "file") ? setTreeVisible((visible) => !visible) : browseFiles()}><FolderOpen size={16} /></button>
              <button type="button" className="icon-button panel-expand-button" aria-label={sidePanelExpanded ? t("app.restoreSplitView") : t("app.expandSidePanel")} onClick={() => setSidePanelExpanded((expanded) => !expanded)}>{sidePanelExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              <button type="button" className="icon-button panel-close-button" title={t("app.closeFilesAndReturnToConversation")} aria-label={t("app.closeFilesAndReturnToConversation")} aria-expanded={sidePanelOpen} onClick={() => setSidePanelOpen(false)}><PanelRight size={16} /></button>
            </div>
          </div>
          <div className={`workspace-panel-body ${!activeSidePanelTab && treeVisible ? "file-browser-only" : ""}`}>
          <div className="workspace-panel-content">
          {liveFiles.notice && activeSidePanelTab?.kind === "file" && <div className="file-editor-banner" role="status">{liveFiles.notice}</div>}
          {fileOpening && <div className="workspace-file-notice" role="status">{t("app.openingFile")}</div>}
          {!activeSidePanelTab ? (!treeVisible && <WorkspacePanelHome
            files={sidePanelTabs.tabs.filter(tab => tab.kind === "file")}
            onBrowse={() => browseFiles()}
            onNotifications={selectedBinding ? () => showPanelTab({ id: "notifications", kind: "notifications" }) : undefined}
            onSubagents={() => showPanelTab({ id: "subagents", kind: "subagents" })}
            onOpenFile={id => { const tab = sidePanelTabs.tabs.find(tab => tab.id === id); if (tab) showPanelTab(tab); }}
          />) : activeSidePanelTab.kind === "notifications" ? (
            selectedBinding && <CompletionTriggers key={clientScope + ":" + selectedBinding.daemon_session_id} client={client} sessionId={selectedBinding.daemon_session_id} active={sidePanelOpen && sidePanelSurface && surfaceActive} triggerId={activeSidePanelTab.triggerId} focusRequest={activeSidePanelTab} />
          ) : activeSidePanelTab.kind === "subagents" ? (
            <SubagentOverview runs={subagentRuns} onSelect={(id) => showPanelTab(subagentSidePanelTab(id))} />
          ) : activeSidePanelTab.kind === "subagent" ? (
            <SubagentTranscript
              key={JSON.stringify([clientScope, selectedBinding?.daemon_session_id, activeSidePanelTab.runId])}
              translation={selectedBinding && sidePanelOpen && surfaceActive && sidePanelSurface ? {
                language: translationLanguage,
                translationProfile,
                translate: (text, language) => client.translateSelection(selectedBinding.daemon_session_id, text, language, translationProfile || undefined),
              } : undefined}
              thinkingDisplay={selectedSession?.agent === "codex" ? undefined : thinkingDisplay}
              run={subagentRuns.find((candidate) => candidate.id === activeSidePanelTab.runId)}
              workspaceRoot={selectedSession?.working_directory}
              onBack={() => showPanelTab({ id: "subagents", kind: "subagents" })}
            />
          ) : openFiles[activeSidePanelTab.path] ? (
            <Suspense fallback={<div className="subagent-panel-empty">{t("app.loadingEditor")}</div>}>
              <OpenWorkspaceFileTab
                active={sidePanelOpen && sidePanelSurface && surfaceActive}
                state={openFiles[activeSidePanelTab.path]}
                line={activeSidePanelTab.line}
                column={activeSidePanelTab.column}
                onDraftChange={(draft) => updateFileDraft(activeSidePanelTab.path, draft)}
                onModeChange={(mode) => updateFileMode(activeSidePanelTab.path, mode)}
                onSave={() => void saveOpenFile(activeSidePanelTab.path)}
                onRefresh={() => {
                  const file = openFilesRef.current[activeSidePanelTab.path];
                  if (!file || file.saveStatus === "saving") return;
                  if (file.kind === "text" && file.draft !== file.file.content && !window.confirm(t("app.discardYourUnsavedEditsAndReloadThisFile"))) return;
                  const timer = fileSaveTimersRef.current.get(activeSidePanelTab.path);
                  if (timer !== undefined) window.clearTimeout(timer);
                  fileSaveTimersRef.current.delete(activeSidePanelTab.path);
                  void liveFiles.refresh(activeSidePanelTab.path, true);
                }}
              />
            </Suspense>
          ) : (
            <div className="subagent-panel-empty">{t("app.fileIsUnavailable")}</div>
          )}
          </div>
          {sidePanelOpen && treeVisible && (!activeSidePanelTab || activeSidePanelTab.kind === "file") && <WorkspaceFileTree api={client} root={treeLocation.path} sessionId={treeLocation.sessionId} selectedPath={activeSidePanelTab?.kind === "file" ? activeSidePanelTab.path : undefined} onOpen={(path) => void openTreeFile(path)} onRoot={(path) => { fileOpenRequest.current++; setFileOpening(false); setDirectoryLocation({ path, sessionId: treeLocation.sessionId }); }} />}
          </div>
        </aside>
      )}

      {createProjectOpen && (
        <CreateProjectDialog
          client={client}
          name={newProjectName}
          selectedRepositoryIds={newProjectRepositoryIds}
          sources={newProjectSources}
          message={message}
          isBusy={isBusy}
          repositoryAdding={repositoryAdding}
          onClose={closeCreateProjectDialog}
          onSubmit={(event) => void createNamedProject(event)}
          onNameChange={setNewProjectName}
          onRepositoryIdsChange={setNewProjectRepositoryIds}
          onRepositoryBusyChange={setRepositoryAdding}
          onFolderModeChange={(selectedPath, folderMode) => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === selectedPath ? { ...item, folderMode } : item))}
          onRemoveSource={(selectedPath) => setNewProjectSources((current) => current.filter((item) => item.candidate.selectedPath !== selectedPath))}
          onAddFolder={() => void chooseNewProjectSources()}
        />
      )}

      {archiveTarget && <ConfirmActionDialog title={t("app.archive2", { p0: archiveTarget.title })} description={t("app.historyIsKeptAnyChannelBindingWillBe")} action={t("app.archiveSessionAction")} busy={archivingSession} error={sidebarActionError} onCancel={() => setArchiveTarget(null)} onConfirm={() => void confirmArchiveSession()} />}

      {removeSourceTarget && (
        <RemoveSourceDialog
          sourceName={removeSourceTarget.name}
          message={message}
          isBusy={isBusy}
          onClose={() => setRemoveSourceTarget(null)}
          onConfirm={() => void confirmRemoveSource()}
        />
      )}

      {addSourcesProjectId && (
        <AddSourcesDialog
          client={client}
          forWorkspace={Boolean(workspaceSourcesTarget)}
          subtitle={workspaceSourcesTarget?.title ?? desktopState.projects.find(project => project.id === addSourcesProjectId)?.name}
          linkedIds={workspaceSourcesTarget ? workspaceSources.map(binding => binding.repository_id ?? binding.source.repository_id).filter((id): id is string => Boolean(id)) : desktopState.repositories.filter(source => source.project_id === addSourcesProjectId && source.repository_id).map(source => source.repository_id!)}
          selectedRepositoryIds={newProjectRepositoryIds}
          sources={newProjectSources}
          message={message}
          isBusy={isBusy}
          repositoryAdding={repositoryAdding}
          onClose={() => setAddSourcesProjectId(null)}
          onRepositoryIdsChange={setNewProjectRepositoryIds}
          onRepositoryBusyChange={setRepositoryAdding}
          onFolderModeChange={(selectedPath, folderMode) => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === selectedPath ? { ...item, folderMode } : item))}
          onAddFolder={() => void chooseNewProjectSources()}
          onConfirm={() => void confirmAddSources()}
        />
      )}

      {createWorkspaceProject && (
        <CreateWorkspaceDialog
          project={createWorkspaceProject}
          title={newWorkspaceTitle}
          branch={newWorkspaceBranch}
          workspaceRepositories={workspaceRepositories}
          message={message}
          isBusy={isBusy}
          onClose={closeCreateWorkspaceDialog}
          onSubmit={(event) => void submitCreateWorkspace(event)}
          onTitleChange={updateNewWorkspaceTitle}
          onBranchChange={setNewWorkspaceBranch}
        >
            <CreateWorkspaceSourcesField
              client={client}
              project={createWorkspaceProject}
              folders={desktopState.folders}
              sourceQuery={workspaceSourceQuery}
              canSelectAll={canSelectAllWorkspaceSources}
              canDeselectAll={canDeselectAllWorkspaceSources}
              workspaceRepositories={workspaceRepositories}
              visibleRepositories={visibleWorkspaceRepositories}
              visibleFolders={visibleWorkspaceFolders}
              folderModes={workspaceFolderModes}
              selectedSourceCount={selectedWorkspaceSourceCount}
              isBusy={isBusy}
              onSelectAll={selectAllWorkspaceSources}
              onSourceQueryChange={setWorkspaceSourceQuery}
              onRepositorySelectedChange={(repositoryId, selected) => setWorkspaceRepositories((current) => current.map((candidate) => candidate.repository.id === repositoryId ? { ...candidate, selected } : candidate))}
              onRepositoryBaseRefChange={updateRepositoryBaseRef}
              onFolderModeChange={(folderId, mode) => setWorkspaceFolderModes((current) => ({ ...current, [folderId]: mode }))}
            />
        </CreateWorkspaceDialog>
      )}

      {workspaceSourcesTarget && !addSourcesProjectId && (() => {
        const boundIds = new Set(workspaceSources.map((binding) => binding.source.id));
        const availableRepositories = desktopState.repositories.filter((source) => source.project_id === workspaceSourcesTarget.project_id && !workspaceHasRepository(workspaceSources, source));
        const availableFolders = desktopState.folders.filter((source) => source.project_id === workspaceSourcesTarget.project_id && !boundIds.has(source.id));
        const selectedRepository = availableRepositories.find((source) => source.id === workspaceSourceId);
        const selectedFolder = availableFolders.find((source) => source.id === workspaceSourceId);
        const matchingRepositories = availableRepositories.filter(source => workspaceSourceMatches(source, addWorkspaceSourceQuery));
        const matchingFolders = availableFolders.filter(source => workspaceSourceMatches(source, addWorkspaceSourceQuery));
        const selectedSource = selectedRepository ?? selectedFolder;
        return <WorkspaceSourcesDialog
          target={workspaceSourcesTarget}
          isBusy={isBusy}
          loading={workspaceSourcesLoading}
          loadError={workspaceSourcesLoadError}
          sourceId={workspaceSourceId}
          selectedRepository={selectedRepository}
          baseRef={workspaceSourceBaseRef}
          message={message}
          onClose={closeWorkspaceSources}
          onRetry={() => void retryWorkspaceSourceBindings()}
          onConfirm={() => void confirmAddWorkspaceSource()}
        >
            {!workspaceSourcesLoadError && workspaceSourcesTarget.status === "ready" && <WorkspaceAddSourceSection
              client={client}
              isBusy={isBusy}
              loading={workspaceSourcesLoading}
              availableRepositories={availableRepositories}
              availableFolders={availableFolders}
              matchingRepositories={matchingRepositories}
              matchingFolders={matchingFolders}
              selectedSource={selectedSource}
              selectedRepository={selectedRepository}
              selectedFolder={selectedFolder}
              query={addWorkspaceSourceQuery}
              sourceId={workspaceSourceId}
              baseRef={workspaceSourceBaseRef}
              mode={workspaceSourceMode}
              onQueryChange={setAddWorkspaceSourceQuery}
              onSelectSource={selectWorkspaceSource}
              onBaseRefChange={setWorkspaceSourceBaseRef}
              onModeChange={setWorkspaceSourceMode}
              onAddOtherRepository={() => { void addSourcesToProject(workspaceSourcesTarget.project_id, true); }}
            />}
            <WorkspaceBindingList
              sources={workspaceSources}
              loading={workspaceSourcesLoading}
              loadError={workspaceSourcesLoadError}
              isBusy={isBusy}
              onReload={() => void loadWorkspaceSources(workspaceSourcesTarget.id)}
              onRetry={() => void retryWorkspaceSourceBindings()}
            />
        </WorkspaceSourcesDialog>;
      })()}

      {archiveWorkspaceTarget && workspaceArchivePreview && (
        <ArchiveWorkspaceDialog
          workspaceTitle={archiveWorkspaceTarget.title}
          preview={workspaceArchivePreview}
          copiedWorkspacePath={copiedWorkspacePath}
          error={workspaceLifecycleError}
          isBusy={isBusy}
          onClose={closeArchiveWorkspaceDialog}
          onCopyPath={() => void copyWorkspacePath(workspaceArchivePreview.root_path)}
          onBrowseFiles={() => { browseFiles(workspaceArchivePreview.root_path); setWorkspaceArchivePreview(null); }}
          onConfirm={() => void confirmArchiveWorkspace()}
        />
      )}

      {deleteProjectTarget && projectDeletePreview && (
        <DeleteProjectDialog
          projectName={deleteProjectTarget.name}
          preview={projectDeletePreview}
          confirmation={deleteProjectConfirmation}
          error={workspaceLifecycleError}
          isBusy={isBusy}
          onConfirmationChange={setDeleteProjectConfirmation}
          onClose={closeDeleteProjectDialog}
          onConfirm={() => void confirmDeleteProject()}
        />
      )}

      {deleteWorkspaceTarget && workspaceDeletePreview && (
        <DeleteWorkspaceDialog
          workspaceTitle={deleteWorkspaceTarget.title}
          preview={workspaceDeletePreview}
          confirmation={deleteWorkspaceConfirmation}
          copiedWorkspacePath={copiedWorkspacePath}
          error={workspaceLifecycleError}
          isBusy={isBusy}
          onConfirmationChange={setDeleteWorkspaceConfirmation}
          onClose={closeDeleteWorkspaceDialog}
          onCopyPath={() => void copyWorkspacePath(workspaceDeletePreview.root_path)}
          onBrowseFiles={() => { browseFiles(workspaceDeletePreview.root_path); setWorkspaceDeletePreview(null); }}
          onConfirm={() => void confirmDeleteWorkspace()}
        />
      )}

      {renameDialogConversation && (
        <RenameConversationDialog
          titleDraft={renameDialogTitleDraft}
          isSaving={isSavingConversationTitle}
          onTitleDraftChange={setRenameDialogTitleDraft}
          onClose={closeRenameConversationDialog}
          onSubmit={(event) => void submitRenameConversationDialog(event)}
        />
      )}

      {renameDialogProject && (
        <RenameProjectDialog
          nameDraft={renameDialogProjectNameDraft}
          message={message}
          isSaving={isSavingProjectName}
          onNameDraftChange={setRenameDialogProjectNameDraft}
          onClose={closeRenameProjectDialog}
          onSubmit={(event) => void submitRenameProjectDialog(event)}
        />
      )}

      {renameDialogWorkspace && (
        <RenameWorkspaceDialog
          titleDraft={renameDialogWorkspaceTitleDraft}
          message={message}
          isSaving={isSavingWorkspaceTitle}
          onTitleDraftChange={setRenameDialogWorkspaceTitleDraft}
          onClose={closeRenameWorkspaceDialog}
          onSubmit={(event) => void submitRenameWorkspaceDialog(event)}
        />
      )}
    </main>
    </SubagentNavigation.Provider>
    </CompletionTriggerNavigation.Provider>
    </MarkdownImageContext.Provider>
  );
}
