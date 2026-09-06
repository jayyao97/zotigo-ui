import { HostMenu } from "./HostShell";
import { SearchPalette } from "./SearchPalette";
import { useClient } from "./ClientContext";
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
  Suspense,
  lazy,
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
  Archive,
  Bell,
  Blocks,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Image,
  Laptop,
  LoaderCircle,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Square,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { titleFromPrompt } from "../shared/conversationTitle";
import { conversationAutoFollowAfterWheel } from "../shared/conversationScroll";
import {
  catalogRefreshDue,
  catalogSnapshotIsCurrent,
  scheduledCatalogSyncDue,
} from "../shared/catalogRefreshPolicy";
import { approvalPolicyLabel } from "../shared/approvalPolicy";
import {
  appendDisplayDeltas,
  acknowledgeOptimisticPrompt,
  ephemeralDisplayItems,
  hasUnresolvedTurnItems,
  mergeDisplayItems,
  optimisticPromptDisplayItem,
  reconcileOptimisticSteering,
  reconcileDisplayPreviews,
  sessionAllowsActiveTurn,
  selectedTimelineActivity,
  workingConversationIds as workingConversationIdsForSessions,
  type EphemeralDisplayBlock,
} from "../shared/sessionDisplay";
import type { AgentCatalogEntry, AgentKind, ApprovalDecisionInput, ApprovalPolicy, CatalogWorkspaceSource, WorkspaceArchivePreview, FolderSourceMode, DisplayDelta, DisplayItem, MessageImageInput, RuntimeProfile, SkillSummary, ZotigoSession } from "../shared/zotigod";
import type { DaemonSessionBinding, DesktopActionResult, DesktopConversation, DesktopProject, DesktopProjectRepository, DesktopState, DesktopWorkspace, ProjectSourceInput, SourceCandidate, TextFileSnapshot } from "../shared/clientTypes";
import { initialWorkspaceSourceSelection } from "../shared/workspaceSourceSelection";
import { maxMessageImageCount, messageImageSizeError } from "../shared/messageImages";
import { reorderSidebarIds, type DropPosition } from "../shared/sidebarOrdering";
import {
  closeSidePanelTab,
  emptySidePanelTabs,
  fileSidePanelTab,
  openSidePanelTab,
  subagentSidePanelTab,
  type SidePanelTabsState,
} from "../shared/sidePanelTabs";
import {
  clampSidePanelWidth,
  defaultSidePanelRatio,
  defaultSidePanelWidth,
  sidePanelWidthForRatio,
} from "../shared/sidePanelSizing";
import type { FileEditorMode, FileSaveStatus } from "./FileEditorTab";
import { ImagePreview } from "./ImagePreview";
import { clipboardImageFiles } from "./clipboardImages";
import { matchingSkills, removeSkillCommand, skillCommandQuery } from "../shared/skillCommands";
import {
  formatCompactTokenCount,
  latestActiveTurn,
  latestProfileResult,
  SessionTimeline,
} from "./conversation/ConversationTimeline";
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
  codexModelLabel,
  NewSessionPrompt,
  RuntimeSettingsPicker,
  type ComposerAttachment,
} from "./conversation/ConversationComposer";
import { resizeTextareaToContent } from "./textareaSizing";

const FileEditorTab = lazy(() => import("./FileEditorTab").then((module) => ({ default: module.FileEditorTab })));

type ConnectionState = "checking" | "online" | "offline";
type WorkspaceRepositoryDraft = {
  repository: DesktopProjectRepository;
  selected: boolean;
  baseRef: string;
};
type ProjectSourceDraft = {
  candidate: SourceCandidate;
  folderMode: FolderSourceMode;
};
type SidebarDragItem = {
  kind: "project" | "workspace" | "workspace-session" | "pinned-session";
  id: string;
  scopeId: string;
};
type SidebarDropTarget = SidebarDragItem & { position: DropPosition };
type SidebarSortProps = {
  draggable: boolean;
  dragging: boolean;
  dropPosition?: DropPosition;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};
type OpenFileState = {
  file: TextFileSnapshot;
  draft: string;
  mode: FileEditorMode;
  saveStatus: FileSaveStatus;
  saveError?: string;
};

const pollIntervalMs = 5000;
const catalogReconciliationIntervalMs = 30_000;
const codexCatalogSyncIntervalMs = 5 * 60_000;
const initialCodexCatalogSyncDelayMs = 15_000;
const sessionDeltaFlushIntervalMs = 50;
const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function ProjectDisclosureIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="project-disclosure-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.7 12.9V6.2c0-1.15.93-2.08 2.08-2.08h2.14c.45 0 .89.15 1.24.42l1.02.78c.36.27.79.42 1.24.42h4.8c1.15 0 2.08.93 2.08 2.08v.8" />
      <path d="M5.1 8.75h11.48c.65 0 1.11.64.9 1.25l-1.44 4.3a2.08 2.08 0 0 1-1.97 1.42H4.76a2.08 2.08 0 0 1-1.98-2.72l1.06-3.24A1.32 1.32 0 0 1 5.1 8.75Z" />
    </svg>
  ) : (
    <svg className="project-disclosure-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.7 6.2c0-1.15.93-2.08 2.08-2.08h2.14c.45 0 .89.15 1.24.42l1.02.78c.36.27.79.42 1.24.42h4.8c1.15 0 2.08.93 2.08 2.08v5.94c0 1.15-.93 2.08-2.08 2.08H4.78A2.08 2.08 0 0 1 2.7 13.76V6.2Z" />
    </svg>
  );
}

function WorkspaceDisclosureIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="workspace-disclosure-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="3" width="13" height="12" rx="2" />
      <path d="M2.8 7h12.4M7 7v7.6" />
    </svg>
  ) : (
    <svg className="workspace-disclosure-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="11" height="9.5" rx="1.8" />
      <path d="M5 2.75h8.2c1.1 0 2 .9 2 2v6.5" />
    </svg>
  );
}

function isMarkdownFile(filePath: string): boolean {
  return /\.(?:md|markdown|mdown|mkd)$/i.test(filePath);
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

function isNearScrollBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

async function attachmentToMessageImage(attachment: ComposerAttachment): Promise<MessageImageInput> {
  return {
    mime_type: attachment.mimeType,
    data_base64: await readFileAsBase64(attachment.file),
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read image attachment")));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const { api: client, kind, signOut, remote } = useClient();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const openSearch = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector("dialog[open]:not(.search-palette)")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.altKey && !event.isComposing) { event.preventDefault(); setSearchOpen((open) => !open); }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);
  const [webNavigationOpen, setWebNavigationOpen] = useState(false);
  const webNavigationButton = useRef<HTMLButtonElement>(null);
  const webNavigationCloseButton = useRef<HTMLButtonElement>(null);
  const previousWebNavigationOpen = useRef(false);
  useEffect(() => {
    if (webNavigationOpen) webNavigationCloseButton.current?.focus();
    else if (previousWebNavigationOpen.current) webNavigationButton.current?.focus();
    previousWebNavigationOpen.current = webNavigationOpen;
  }, [webNavigationOpen]);
  const pathActionLabel = kind === "web" || remote ? "Copy server path" : "Open in Finder";
  const [daemonUrl, setDaemonUrl] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [sessions, setSessions] = useState<ZotigoSession[]>([]);
  const [desktopState, setDesktopState] = useState<DesktopState>(emptyDesktopState);
  const [message, setMessage] = useState<string | null>(null);
  const [sidebarActionError, setSidebarActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pauseRequestedTurnId, setPauseRequestedTurnId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSources, setNewProjectSources] = useState<ProjectSourceDraft[]>([]);
  const [addSourcesProjectId, setAddSourcesProjectId] = useState<string | null>(null);
  const [removeSourceTarget, setRemoveSourceTarget] = useState<{ kind: "git" | "folder"; id: string; name: string } | null>(null);
  const [createWorkspaceProjectId, setCreateWorkspaceProjectId] = useState<string | null>(null);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState("");
  const [newWorkspaceBranchName, setNewWorkspaceBranchName] = useState("");
  const [workspaceRepositories, setWorkspaceRepositories] = useState<WorkspaceRepositoryDraft[]>([]);
  const [workspaceFolderModes, setWorkspaceFolderModes] = useState<Record<string, "" | FolderSourceMode>>({});
  const [workspaceSourcesTarget, setWorkspaceSourcesTarget] = useState<DesktopWorkspace | null>(null);
  const [workspaceSources, setWorkspaceSources] = useState<CatalogWorkspaceSource[]>([]);
  const [workspaceSourcesLoading, setWorkspaceSourcesLoading] = useState(false);
  const [workspaceSourcesLoadError, setWorkspaceSourcesLoadError] = useState<string | null>(null);
  const workspaceSourcesRequestRef = useRef(0);
  const [workspaceSourceId, setWorkspaceSourceId] = useState("");
  const [workspaceSourceBaseRef, setWorkspaceSourceBaseRef] = useState("HEAD");
  const [workspaceSourceBranchName, setWorkspaceSourceBranchName] = useState("");
  const [workspaceSourceMode, setWorkspaceSourceMode] = useState<FolderSourceMode>("direct");
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);
  const [sidebarActionMenuOpensUp, setSidebarActionMenuOpensUp] = useState(false);
  const [archiveWorkspaceTarget, setArchiveWorkspaceTarget] = useState<DesktopWorkspace | null>(null);
  const [workspaceArchivePreview, setWorkspaceArchivePreview] = useState<WorkspaceArchivePreview | null>(null);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] = useState<DesktopWorkspace | null>(null);
  const [workspaceDeletePreview, setWorkspaceDeletePreview] = useState<WorkspaceArchivePreview | null>(null);
  const [workspaceLifecycleError, setWorkspaceLifecycleError] = useState<string | null>(null);
  const [deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation] = useState("");
  const [copiedWorkspacePath, setCopiedWorkspacePath] = useState<string | null>(null);
  const [projectOpenIds, setProjectOpenIds] = useState<Set<string>>(new Set());
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(new Set());
  const [projectOverviewId, setProjectOverviewId] = useState<string | null>(null);
  const [sidebarDragItem, setSidebarDragItem] = useState<SidebarDragItem | null>(null);
  const [sidebarDropTarget, setSidebarDropTarget] = useState<SidebarDropTarget | null>(null);
  const [sessionItems, setSessionItems] = useState<DisplayItem[]>([]);
  const [ephemeralBlocks, setEphemeralBlocks] = useState<EphemeralDisplayBlock[]>([]);
  const [optimisticPromptItems, setOptimisticPromptItems] = useState<DisplayItem[]>([]);
  const [sessionItemsLoading, setSessionItemsLoading] = useState(false);
  const [sessionItemsError, setSessionItemsError] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [conversationPrompt, setConversationPrompt] = useState("");
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillMenuIndex, setSkillMenuIndex] = useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [isConversationAtBottom, setIsConversationAtBottom] = useState(true);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [defaultProfile, setDefaultProfile] = useState("");
  const [draftProfile, setDraftProfile] = useState("");
  const [profileOverrides, setProfileOverrides] = useState<Record<string, string>>({});
  const [draftApprovalPolicy, setDraftApprovalPolicy] = useState<ApprovalPolicy>("auto");
  const [approvalPolicyOverrides, setApprovalPolicyOverrides] = useState<Record<string, ApprovalPolicy>>({});
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [runtimeAgents, setRuntimeAgents] = useState<AgentCatalogEntry[]>([]);
  const [runtimeAgentsLoading, setRuntimeAgentsLoading] = useState(false);
  const [draftAgent, setDraftAgent] = useState<AgentKind>("zotigo");
  const [draftCodexModel, setDraftCodexModel] = useState("");
  const [draftCodexReasoningEffort, setDraftCodexReasoningEffort] = useState("");
  const [isEditingConversationTitle, setIsEditingConversationTitle] = useState(false);
  const [isSavingConversationTitle, setIsSavingConversationTitle] = useState(false);
  const [conversationTitleDraft, setConversationTitleDraft] = useState("");
  const [renameDialogConversationId, setRenameDialogConversationId] = useState<string | null>(null);
  const [renameDialogTitleDraft, setRenameDialogTitleDraft] = useState("");
  const [renameDialogProjectId, setRenameDialogProjectId] = useState<string | null>(null);
  const [renameDialogProjectNameDraft, setRenameDialogProjectNameDraft] = useState("");
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const [renameDialogWorkspaceId, setRenameDialogWorkspaceId] = useState<string | null>(null);
  const [renameDialogWorkspaceTitleDraft, setRenameDialogWorkspaceTitleDraft] = useState("");
  const [isSavingWorkspaceTitle, setIsSavingWorkspaceTitle] = useState(false);
  const [sidePanelTabs, setSidePanelTabs] = useState<SidePanelTabsState>(emptySidePanelTabs);
  const [sidePanelWidth, setSidePanelWidth] = useState(defaultSidePanelWidth);
  const [isSidePanelResizing, setIsSidePanelResizing] = useState(false);
  const [openFiles, setOpenFiles] = useState<Record<string, OpenFileState>>({});
  const openFilesRef = useRef(openFiles);
  useEffect(() => {
    const beforeSwitch = (event: Event) => {
      if (Object.values(openFiles).some((file) => file.saveStatus === "saving")) { window.alert("Wait for the current file save before switching hosts."); event.preventDefault(); return; }
      if ((draftPrompt.trim() || conversationPrompt.trim() || composerAttachments.length || Object.values(openFiles).some((file) => file.saveStatus !== "clean")) && !window.confirm("Switch hosts and discard unsent messages and unsaved file changes?")) event.preventDefault();
    };
    window.addEventListener("zotigo:before-host-switch", beforeSwitch);
    return () => window.removeEventListener("zotigo:before-host-switch", beforeSwitch);
  }, [openFiles, draftPrompt, conversationPrompt, composerAttachments]);
  const fileSaveTimersRef = useRef<Map<string, number>>(new Map());
  const filesSavingRef = useRef<Set<string>>(new Set());
  const conversationScrollRef = useRef<HTMLDivElement | null>(null);
  const appFrameRef = useRef<HTMLElement | null>(null);
  const sidePanelRef = useRef<HTMLElement | null>(null);
  const sidePanelRatioRef = useRef(defaultSidePanelRatio);
  const conversationAutoScrollFrameRef = useRef<number | null>(null);
  const sessionItemsPrevCursorRef = useRef<string | null>(null);
  const sessionItemsPagingInitializedRef = useRef(false);
  const sessionItemsLoadedForSessionIdRef = useRef<string | null>(null);
  const olderSessionItemsLoadingRef = useRef(false);
  const conversationTitleInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const stickToBottomRef = useRef(true);
  const sessionItemsRef = useRef<DisplayItem[]>([]);
  const selectedSessionIdRef = useRef<string | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const titleSuggestionAttemptsRef = useRef<Set<string>>(new Set());
  const sessionEventsConnectedRef = useRef(false);
  const sidebarDragItemRef = useRef<SidebarDragItem | null>(null);
  const sidebarActionMenuRef = useRef<HTMLDivElement | null>(null);
  const projectsSectionRef = useRef<HTMLElement | null>(null);
  const lastCodexCatalogSyncAttemptAtRef = useRef(0);
  const desktopStateLoadedRef = useRef(false);
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

  useEffect(() => () => {
    for (const timer of fileSaveTimersRef.current.values()) window.clearTimeout(timer);
    fileSaveTimersRef.current.clear();
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

  useLayoutEffect(() => {
    const menu = sidebarActionMenuRef.current;
    const scroller = menu?.closest<HTMLElement>(".projects-section");
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
    const scroller = projectsSectionRef.current;
    if (!scroller) return;
    let frame: number | null = null;
    const updateStickyRows = () => {
      frame = null;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const rowHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-height")) || 30;
      for (const row of scroller.querySelectorAll<HTMLElement>(".project-row-shell, .workspace-row-shell")) {
        const stickyTop = scrollerTop + (row.classList.contains("workspace-row-shell") ? rowHeight : 0);
        const bounds = row.getBoundingClientRect();
        row.classList.toggle("is-stuck", bounds.top <= stickyTop + 0.5 && bounds.bottom > stickyTop + 0.5);
      }
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateStickyRows);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const mutationObserver = new MutationObserver(scheduleUpdate);
    scroller.addEventListener("scroll", scheduleUpdate, { passive: true });
    resizeObserver.observe(scroller);
    mutationObserver.observe(scroller, { childList: true, subtree: true });
    scheduleUpdate();
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
  const renameDialogConversation = useMemo(
    () =>
      desktopState.conversations.find((conversation) => conversation.id === renameDialogConversationId) ?? null,
    [desktopState.conversations, renameDialogConversationId],
  );
  const renameDialogProject = useMemo(
    () => desktopState.projects.find((project) => project.id === renameDialogProjectId) ?? null,
    [desktopState.projects, renameDialogProjectId],
  );
  const renameDialogWorkspace = useMemo(
    () => desktopState.workspaces.find((workspace) => workspace.id === renameDialogWorkspaceId) ?? null,
    [desktopState.workspaces, renameDialogWorkspaceId],
  );
  const createWorkspaceProject = useMemo(
    () => desktopState.projects.find((project) => project.id === createWorkspaceProjectId) ?? null,
    [createWorkspaceProjectId, desktopState.projects],
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
  const profileWorkspace = selectedConversation?.workspace_id
    ? desktopState.workspaces.find((workspace) => workspace.id === selectedConversation.workspace_id) ?? null
    : selectedWorkspace;
  const profileWorkingDirectory = profileWorkspace?.root_path;
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
  const pinnedConversations = useMemo(
    () =>
      desktopState.conversations
        .filter((conversation) => conversation.pinned_at)
        .sort((left, right) => (left.pinned_order ?? 0) - (right.pinned_order ?? 0)),
    [desktopState.conversations],
  );
  const selectedActiveTurn = useMemo(() => latestActiveTurn(sessionItems), [sessionItems]);
  const selectedActivity = useMemo(
    () => selectedTimelineActivity({
      conversationId: selectedConversation?.id,
      sessionId: selectedBinding?.daemon_session_id,
      loadedSessionId: sessionItemsLoadedForSessionIdRef.current,
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
    ],
  );
  const workingConversationIds = useMemo(
    () => workingConversationIdsForSessions(desktopState.bindings, sessions, selectedActivity),
    [desktopState.bindings, selectedActivity, sessions],
  );

  function sidebarSortProps(item: SidebarDragItem, orderedIds: string[]): SidebarSortProps {
    const isCurrentTarget = sidebarDropTarget?.kind === item.kind
      && sidebarDropTarget.scopeId === item.scopeId
      && sidebarDropTarget.id === item.id;
    return {
      draggable: !isBusy,
      dragging: sidebarDragItem?.kind === item.kind && sidebarDragItem.scopeId === item.scopeId && sidebarDragItem.id === item.id,
      dropPosition: isCurrentTarget ? sidebarDropTarget.position : undefined,
      onDragStart: (event) => {
        if (event.target instanceof Element && event.target.closest(".project-collapse-button, .workspace-collapse-button, .project-row-actions, .workspace-row-actions, .sidebar-session-actions")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        sidebarDragItemRef.current = item;
        setSidebarDragItem(item);
        setSidebarDropTarget(null);
      },
      onDragOver: (event) => {
        const dragged = sidebarDragItemRef.current;
        if (!dragged || dragged.kind !== item.kind || dragged.scopeId !== item.scopeId || dragged.id === item.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
        setSidebarDropTarget({ ...item, position });
      },
      onDrop: (event) => {
        event.preventDefault();
        const dragged = sidebarDragItemRef.current;
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
        sidebarDragItemRef.current = null;
        setSidebarDragItem(null);
        setSidebarDropTarget(null);
        if (!dragged || dragged.kind !== item.kind || dragged.scopeId !== item.scopeId) return;
        const reorderedIds = reorderSidebarIds(orderedIds, dragged.id, item.id, position);
        if (reorderedIds === orderedIds || reorderedIds.every((id, index) => id === orderedIds[index])) return;
        void persistSidebarOrder(item.kind, item.scopeId, reorderedIds);
      },
      onDragEnd: () => {
        sidebarDragItemRef.current = null;
        setSidebarDragItem(null);
        setSidebarDropTarget(null);
      },
    };
  }

  async function persistSidebarOrder(kind: SidebarDragItem["kind"], scopeId: string, orderedIds: string[]) {
    try {
      const state = kind === "project"
        ? await client.reorderProjects(orderedIds)
        : kind === "workspace"
          ? await client.reorderWorkspaces(scopeId, orderedIds)
          : kind === "workspace-session"
            ? await client.reorderWorkspaceConversations(orderedIds)
            : await client.reorderPinnedConversations(orderedIds);
      applyDesktopState(state);
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    }
  }
  const previousConversations = useMemo(
    () => desktopState.conversations.filter((conversation) => conversation.workspace_id === null),
    [desktopState.conversations],
  );
  const selectedActiveTurnId = selectedActiveTurn?.turn?.id ?? null;
  const hasActiveTurn = sessionAllowsActiveTurn(selectedSession?.state) && selectedActiveTurn !== null;
  const timelineItems = useMemo(
    () => [
      ...sessionItems,
      ...ephemeralDisplayItems(ephemeralBlocks),
      ...reconcileOptimisticSteering(optimisticPromptItems, sessionItems),
    ],
    [ephemeralBlocks, optimisticPromptItems, sessionItems],
  );
  const subagentRuns = useMemo(() => buildSubagentRuns(sessionItems), [sessionItems]);
  const previewAttachment = useMemo(
    () => composerAttachments.find((attachment) => attachment.id === previewAttachmentId) ?? null,
    [composerAttachments, previewAttachmentId],
  );
  const activePrompt = selectedConversation ? conversationPrompt : draftPrompt;
  const activeSkillCommand = skillCommandQuery(activePrompt);
  const skillMatches = useMemo(
    () => matchingSkills(availableSkills, activeSkillCommand?.query ?? "")
      .filter((skill) => skill.enabled && !selectedSkillNames.includes(skill.name)),
    [activeSkillCommand?.query, availableSkills, selectedSkillNames],
  );
  const skillMenuOpen = activeSkillCommand !== null && !skillMenuDismissed;
  const hasComposerDraft = conversationPrompt.trim() !== "" || composerAttachments.length > 0;
  const runtimeOccupied = selectedSession?.error_code === "runtime_occupied";
  const canSubmitSelectedPrompt = Boolean(selectedConversation && !runtimeOccupied && !isBusy && hasComposerDraft);
  const showStopControl = Boolean(
    selectedSession?.state === "running" && selectedActiveTurnId && !hasComposerDraft && !isBusy,
  );
  sessionItemsRef.current = sessionItems;
  selectedSessionIdRef.current = selectedBinding?.daemon_session_id ?? null;
  selectedConversationIdRef.current = selectedConversation?.id ?? null;

  useLayoutEffect(() => {
    if (!isEditingConversationTitle) {
      return;
    }
    conversationTitleInputRef.current?.focus();
    conversationTitleInputRef.current?.select();
  }, [isEditingConversationTitle]);

  useEffect(() => {
    setIsEditingConversationTitle(false);
    setConversationTitleDraft(selectedConversation?.title ?? "");
    setPauseRequestedTurnId(null);
    for (const timer of fileSaveTimersRef.current.values()) window.clearTimeout(timer);
    fileSaveTimersRef.current.clear();
    setOpenFiles({});
    openFilesRef.current = {};
    setSidePanelTabs(emptySidePanelTabs);
    setSelectedSkillNames([]);
    setAvailableSkills([]);
    setSkillsError(null);
    setSkillMenuDismissed(false);
  }, [selectedConversation?.id]);

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

    Promise.all([client.getDaemonConfig(), client.getDesktopState()])
      .then(([config, state]) => {
        if (!isMounted) {
          return;
        }
        setDaemonUrl(config.baseUrl);
        setDesktopState(state);
        lastCatalogRefreshAttemptAtRef.current = Date.now();
        setProjectOpenIds(new Set(state.projects.map((project) => project.id)));
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
      if (document.hidden || sessionRefreshesInFlightRef.current > 0) return;
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
  }, [selectedBinding?.daemon_session_id]);

  useEffect(() => {
    clearPendingSessionDeltas();
    sessionEventsConnectedRef.current = false;
    sessionItemsPrevCursorRef.current = null;
    sessionItemsPagingInitializedRef.current = false;
    sessionItemsLoadedForSessionIdRef.current = null;
    olderSessionItemsLoadingRef.current = false;
    setSessionItems([]);
    setEphemeralBlocks([]);
    setOptimisticPromptItems([]);
    setSessionItemsError(null);
    setSessionItemsLoading(Boolean(selectedBinding));
    if (!selectedBinding) {
      void client.unsubscribeSessionEvents();
      return;
    }

    let active = true;
    const sessionId = selectedBinding.daemon_session_id;
    const removeListener = client.onSessionEvent((envelope) => {
      if (!active || envelope.session_id !== sessionId) {
        return;
      }
      if (envelope.status === "connected") {
        sessionEventsConnectedRef.current = true;
      } else if (envelope.status === "reconnecting") {
        sessionEventsConnectedRef.current = false;
        clearPendingSessionDeltas();
        setEphemeralBlocks([]);
      } else if (envelope.status === "unsupported") {
        sessionEventsConnectedRef.current = false;
        clearPendingSessionDeltas();
        setEphemeralBlocks([]);
      }
      const sessionEvent = envelope.event;
      if (sessionEvent?.type === "delta") {
        queueSessionDelta(sessionEvent.delta);
      }
      if (sessionEvent?.type === "item") {
        flushPendingSessionDeltas();
        const item = sessionEvent.item;
        setSessionItems((current) => mergeDisplayItems(current, [item]));
        setEphemeralBlocks((current) => reconcileDisplayPreviews(current, item));
        setOptimisticPromptItems((current) => reconcileOptimisticSteering(current, [item]));
        applyDurableItemEffects(selectedBinding, [item]);
      }
    });

    void refreshSessionItems(selectedBinding).then((items) => {
      if (!active) return;
      const lastSequence = items.reduce<number | undefined>(
        (maximum, item) => Math.max(maximum ?? 0, item.sequence),
        undefined,
      );
      void client.subscribeSessionEvents(sessionId, lastSequence);
    });

    return () => {
      active = false;
      clearPendingSessionDeltas();
      removeListener();
      void client.unsubscribeSessionEvents();
    };
  }, [selectedBinding?.daemon_session_id]);

  useEffect(() => {
    setConversationPrompt("");
    clearComposerAttachments();
    setPreviewAttachmentId(null);
    setAttachmentMenuOpen(false);
    cancelScheduledConversationAutoScroll();
    setStickToBottom(true);
    scheduleConversationScrollToBottom();
  }, [selectedConversation?.id]);

  useEffect(() => () => cancelScheduledConversationAutoScroll(), []);

  useEffect(() => {
    let active = true;
    setProfilesLoading(true);
    client
      .getProfiles(profileWorkingDirectory)
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
  }, [profileWorkingDirectory, daemonUrl]);

  useEffect(() => {
    let active = true;

    setRuntimeAgentsLoading(true);
    client.getAgents()
      .then(async (catalog) => {
        const nativeAgent = catalog.agents.find((agent) => agent.id === "zotigo");
        const installedCodex = catalog.agents.find((agent) => agent.id === "codex");
        let preparedCodex: AgentCatalogEntry | undefined;
        if (installedCodex) {
          try {
            preparedCodex = await client.prepareCodex();
          } catch {
            preparedCodex = undefined;
          }
        }
        if (!active) return;
        const availableAgents = [nativeAgent, preparedCodex].filter((agent): agent is AgentCatalogEntry => Boolean(agent));
        setRuntimeAgents(availableAgents);
        const models = preparedCodex?.models ?? [];
        const defaultModel = models.find((model) => model.is_default) ?? models[0];
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
  }, [daemonUrl]);

  useLayoutEffect(() => {
    resizeConversationTextarea();
    if (stickToBottomRef.current) {
      scheduleConversationScrollToBottom();
    }
  }, [conversationPrompt, selectedConversation?.id]);

  useEffect(() => {
    const updateAnimationState = () => {
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
    setDesktopState(update);
  }

  async function refreshSessions(options: { quiet?: boolean; syncCodex?: boolean } = {}): Promise<void> {
    const requestId = ++sessionRefreshRequestIdRef.current;
    const desktopStateGeneration = desktopStateGenerationRef.current;
    sessionRefreshesInFlightRef.current += 1;
    if (!options.quiet) {
      setIsBusy(true);
      setMessage(null);
    }

    try {
      const shouldRefreshCatalog = catalogRefreshDue({
        syncRequested: options.syncCodex === true,
        desktopStateLoaded: desktopStateLoadedRef.current,
        nowMs: Date.now(),
        lastAttemptAtMs: lastCatalogRefreshAttemptAtRef.current,
        intervalMs: catalogReconciliationIntervalMs,
      });
      if (options.syncCodex) lastCodexCatalogSyncAttemptAtRef.current = Date.now();
      if (shouldRefreshCatalog) lastCatalogRefreshAttemptAtRef.current = Date.now();
      let catalogError: unknown;
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
      const [listedSessions, nextDesktopState] = await Promise.all([
        client.listSessions(),
        desktopStatePromise,
      ]);
      let nextSessions = listedSessions;
      if (selectedBinding) {
        try {
          const selectedSessionDetail = await client.getSession(selectedBinding.daemon_session_id);
          nextSessions = upsertSession(nextSessions, selectedSessionDetail);
        } catch {
          // The list remains usable if the selected session disappears between requests.
        }
      }
      if (requestId < latestAppliedSessionRefreshIdRef.current) {
        return;
      }
      latestAppliedSessionRefreshIdRef.current = requestId;
      setConnectionState("online");
      if (!desktopStateLoadedRef.current) {
        desktopStateLoadedRef.current = true;
        codexCatalogSyncNotBeforeRef.current = Date.now() + initialCodexCatalogSyncDelayMs;
      }
      if (nextDesktopState && catalogSnapshotIsCurrent(desktopStateGeneration, desktopStateGenerationRef.current)) {
        setDesktopState((current) => sameJsonValue(current, nextDesktopState) ? current : nextDesktopState);
      }
      setSessions((current) => sameJsonValue(current, nextSessions) ? current : nextSessions);
      setApprovalPolicyOverrides((current) => clearResolvedApprovalPolicyOverrides(current, nextSessions));
      if (catalogError && !options.quiet) setMessage(errorMessage(catalogError));
      if (selectedBinding && !sessionEventsConnectedRef.current) {
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

  async function refreshSessionItems(
    binding: DaemonSessionBinding,
    options: { quiet?: boolean } = {},
  ): Promise<DisplayItem[]> {
    if (!options.quiet) {
      setSessionItemsLoading(true);
      setSessionItemsError(null);
    }

    try {
      const response = await client.listSessionItems(binding.daemon_session_id, { limit: 200 });
      if (selectedSessionIdRef.current !== binding.daemon_session_id) {
        return [];
      }

      let fetchedItems = response.items;
      let prevCursor = response.prev_cursor || null;
      let mergedItems = mergeDisplayItems(sessionItemsRef.current, fetchedItems);
      while (prevCursor && hasUnresolvedTurnItems(mergedItems)) {
        const older = await client.listSessionItems(binding.daemon_session_id, {
          limit: 200,
          before: Number(prevCursor),
        });
        if (selectedSessionIdRef.current !== binding.daemon_session_id) {
          return [];
        }
        fetchedItems = mergeDisplayItems(fetchedItems, older.items);
        mergedItems = mergeDisplayItems(mergedItems, older.items);
        prevCursor = older.prev_cursor || null;
      }
      if (!sessionItemsPagingInitializedRef.current) {
        sessionItemsPrevCursorRef.current = prevCursor;
        sessionItemsPagingInitializedRef.current = true;
      }
      sessionItemsLoadedForSessionIdRef.current = binding.daemon_session_id;
      setSessionItems((current) => mergeDisplayItems(current, fetchedItems));
      setEphemeralBlocks((current) =>
        current.filter((block) => !fetchedItems.some((item) => item.id === block.id)),
      );
      setOptimisticPromptItems((current) => reconcileOptimisticSteering(current, fetchedItems));
      applyDurableItemEffects(binding, fetchedItems);
      setSessionItemsError(null);
      return fetchedItems;
    } catch (error) {
      if (selectedSessionIdRef.current === binding.daemon_session_id) {
        setSessionItemsError(errorMessage(error));
      }
      return [];
    } finally {
      if (!options.quiet && selectedSessionIdRef.current === binding.daemon_session_id) {
        setSessionItemsLoading(false);
      }
    }
  }

  function applyDurableItemEffects(binding: DaemonSessionBinding, items: DisplayItem[]) {
    const conversation = desktopState.conversations.find((item) => item.id === binding.conversation_id);
    const firstPrompt = firstUserPrompt(items);
    if (
      conversation
      && firstPrompt
      && conversation.title === titleFromPrompt(firstPrompt)
      && items.some((item) => item.type === "turn_completed")
      && !titleSuggestionAttemptsRef.current.has(conversation.id)
    ) {
      titleSuggestionAttemptsRef.current.add(conversation.id);
      void client
        .suggestConversationTitle(conversation.id)
        .then(applyDesktopState)
        .catch(() => undefined);
    }
    const profileResult = latestProfileResult(items);
    if (profileResult?.profile?.to) {
      setProfileOverrides((current) => {
        if (current[binding.daemon_session_id] !== profileResult.profile?.to) {
          return current;
        }
        const next = { ...current };
        delete next[binding.daemon_session_id];
        return next;
      });
    }
  }

  function openCreateProjectDialog() {
    setMessage(null);
    setNewProjectName("");
    setNewProjectSources([]);
    setCreateProjectOpen(true);
  }

  function closeCreateProjectDialog() {
    if (isBusy) {
      return;
    }
    setCreateProjectOpen(false);
  }

  async function chooseNewProjectSources() {
    setMessage(null);
    try {
      const candidates = await client.chooseSourceFolders();
      setNewProjectSources((current) => {
        const paths = new Set(current.map((draft) => draft.candidate.selectedPath));
        return [...current, ...candidates.filter((candidate) => !paths.has(candidate.selectedPath)).map((candidate) => ({ candidate, folderMode: "direct" as const }))];
      });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function createNamedProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) {
      return;
    }

    setIsBusy(true);
    setMessage(null);
    try {
      applyDesktopState(await client.createProject({
        name,
        sources: newProjectSources.map(projectSourceInput),
      }));
      setCreateProjectOpen(false);
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    } finally {
      setIsBusy(false);
    }
  }

  function openCreateWorkspaceDialog(project: DesktopProject) {
    const repositories = desktopState.repositories.filter((candidate) => candidate.project_id === project.id);
    const folders = desktopState.folders.filter((candidate) => candidate.project_id === project.id);
    const selection = initialWorkspaceSourceSelection(repositories, folders);
    setMessage(null);
    setNewWorkspaceTitle("");
    setNewWorkspaceBranchName("");
    setWorkspaceRepositories(repositories.map((repository) => ({
      repository,
      selected: selection.repositoryIds.includes(repository.id),
      baseRef: repository.default_base_ref,
    })));
    setWorkspaceFolderModes(selection.folderModes);
    setCreateWorkspaceProjectId(project.id);
  }

  function closeCreateWorkspaceDialog() {
    if (!isBusy) {
      setCreateWorkspaceProjectId(null);
    }
  }

  function updateNewWorkspaceTitle(title: string) {
    setNewWorkspaceTitle(title);
  }

  function updateRepositoryBaseRef(repositoryId: string, baseRef: string) {
    setWorkspaceRepositories((current) => current.map((draft) => draft.repository.id === repositoryId
      ? { ...draft, baseRef }
      : draft));
  }

  function submitCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createWorkspaceFromDraft();
  }

  async function createWorkspaceFromDraft() {
    if (!createWorkspaceProjectId || !newWorkspaceTitle.trim()) {
      return;
    }
    const projectId = createWorkspaceProjectId;
    const modes = workspaceFolderModes;
    setIsBusy(true);
    setMessage(null);
    try {
      const folders = Object.entries(modes)
        .filter((entry): entry is [string, FolderSourceMode] => entry[1] !== "")
        .map(([folderId, mode]) => ({ folderId, mode }));
      const state = await client.createWorkspace({
        projectId,
        title: newWorkspaceTitle.trim(),
        branchName: newWorkspaceBranchName.trim() || undefined,
        repositories: workspaceRepositories.filter((draft) => draft.selected).map((draft) => ({
          repositoryId: draft.repository.id,
          baseRef: draft.baseRef,
        })),
        folders,
      });
      applyDesktopState(state);
      setProjectOpenIds((current) => new Set(current).add(projectId));
      setCreateWorkspaceProjectId(null);
      setDraftPrompt("");
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    } finally {
      setIsBusy(false);
    }
  }

  async function selectProject(id: string | null) {
    setWebNavigationOpen(false);
    setMessage(null);
    applyDesktopState(await client.selectProject(id));
  }

  async function openProjectOverview(project: DesktopProject) {
    setProjectOverviewId(project.id);
    await selectProject(project.id);
  }

  async function openWorkspaceSources(workspace: DesktopWorkspace) {
    setMessage(null);
    setWorkspaceSourcesTarget(workspace);
    setWorkspaceSources([]);
    setWorkspaceSourceId("");
    setWorkspaceSourceBaseRef("HEAD");
    setWorkspaceSourceBranchName("");
    await loadWorkspaceSources(workspace.id);
  }

  async function loadWorkspaceSources(workspaceId: string) {
    const requestId = ++workspaceSourcesRequestRef.current;
    setWorkspaceSourcesLoading(true);
    setWorkspaceSourcesLoadError(null);
    try {
      const sources = await client.getWorkspaceSources(workspaceId);
      if (workspaceSourcesRequestRef.current === requestId) setWorkspaceSources(sources);
    } catch (error) {
      if (workspaceSourcesRequestRef.current === requestId) {
        setWorkspaceSources([]);
        setWorkspaceSourcesLoadError(errorMessage(error));
      }
    } finally {
      if (workspaceSourcesRequestRef.current === requestId) setWorkspaceSourcesLoading(false);
    }
  }

  function closeWorkspaceSources() {
    workspaceSourcesRequestRef.current += 1;
    setWorkspaceSourcesTarget(null);
    setWorkspaceSourcesLoading(false);
  }

  function selectWorkspaceSource(sourceId: string) {
    setWorkspaceSourceId(sourceId);
    const repository = desktopState.repositories.find((source) => source.id === sourceId);
    const folder = desktopState.folders.find((source) => source.id === sourceId);
    setWorkspaceSourceBaseRef(repository?.default_base_ref ?? "HEAD");
    setWorkspaceSourceBranchName("");
    setWorkspaceSourceMode(folder?.default_mode ?? "direct");
  }

  async function confirmAddWorkspaceSource() {
    if (!workspaceSourcesTarget || !workspaceSourceId) return;
    const repository = desktopState.repositories.find((source) => source.id === workspaceSourceId);
    const folder = desktopState.folders.find((source) => source.id === workspaceSourceId);
    setIsBusy(true);
    setMessage(null);
    try {
      const sources = await client.addWorkspaceSource(workspaceSourcesTarget.id, {
        sourceId: workspaceSourceId,
        ...(repository ? { baseRef: workspaceSourceBaseRef, branchName: workspaceSourceBranchName || undefined } : {}),
        ...(folder ? { mode: workspaceSourceMode } : {}),
      });
      setWorkspaceSources(sources);
      setWorkspaceSourceId("");
      setWorkspaceSourceBranchName("");
    } catch (error) {
      setMessage(errorMessage(error));
      await loadWorkspaceSources(workspaceSourcesTarget.id);
    } finally {
      setIsBusy(false);
    }
  }

  async function retryWorkspaceSourceBindings() {
    if (!workspaceSourcesTarget) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const state = await client.retryWorkspace(workspaceSourcesTarget.id);
      applyDesktopState(state);
      const repaired = state.workspaces.find((workspace) => workspace.id === workspaceSourcesTarget.id);
      if (repaired) setWorkspaceSourcesTarget(repaired);
      await loadWorkspaceSources(workspaceSourcesTarget.id);
    } catch (error) {
      setMessage(errorMessage(error));
      await loadWorkspaceSources(workspaceSourcesTarget.id);
    } finally {
      setIsBusy(false);
    }
  }

  function toggleProjectOpen(projectId: string) {
    setProjectOpenIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  async function selectWorkspace(id: string) {
    setWebNavigationOpen(false);
    setProjectOverviewId(null);
    setMessage(null);
    applyDesktopState(await client.selectWorkspace(id));
  }

  function selectConversation(id: string) {
    setWebNavigationOpen(false);
    const conversation = desktopState.conversations.find((candidate) => candidate.id === id);
    if (!conversation || desktopState.selectedConversationId === id) {
      return;
    }
    setProjectOverviewId(null);
    setMessage(null);
    sessionItemsRef.current = [];
    setSessionItems([]);
    setEphemeralBlocks([]);
    setOptimisticPromptItems([]);
    applyDesktopState((current) => ({
      ...current,
      selectedProjectId: conversation.project_id,
      selectedWorkspaceId: conversation.workspace_id,
      selectedConversationId: id,
    }));
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
    setWebNavigationOpen(false);
    setProjectOverviewId(null);
    setMessage(null);
    setDraftPrompt("");
    await client.selectProject(null);
    applyDesktopState(await client.selectConversation(null));
  }

  async function openNewConversationForWorkspace(workspace: DesktopWorkspace) {
    setWebNavigationOpen(false);
    setProjectOverviewId(null);
    setMessage(null);
    setDraftPrompt("");
    await client.selectWorkspace(workspace.id);
    applyDesktopState(await client.selectConversation(null));
  }

  async function retryWorkspace(workspace: DesktopWorkspace) {
    setIsBusy(true);
    setMessage(null);
    try {
      const state = await client.retryWorkspace(workspace.id);
      applyDesktopState(state);
      const repaired = state.workspaces.find((candidate) => candidate.id === workspace.id);
      if (repaired?.status === "error") {
        setMessage(repaired.error || "Workspace repair failed.");
      }
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    } finally {
      setIsBusy(false);
    }
  }

  async function openArchiveWorkspaceDialog(workspace: DesktopWorkspace) {
    setWorkspaceMenuId(null);
    setSidebarActionError(null);
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const preview = await client.previewWorkspaceArchive(workspace.id);
      setWorkspaceArchivePreview(preview);
      setArchiveWorkspaceTarget(workspace);
      setCopiedWorkspacePath(null);
    } catch (error) {
      setSidebarActionError(`Could not inspect “${workspace.title}”: ${errorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  }

  function closeArchiveWorkspaceDialog() {
    if (isBusy) return;
    setArchiveWorkspaceTarget(null);
    setWorkspaceArchivePreview(null);
    setWorkspaceLifecycleError(null);
    setCopiedWorkspacePath(null);
  }

  async function confirmArchiveWorkspace() {
    if (!archiveWorkspaceTarget || !workspaceArchivePreview) return;
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const state = await client.archiveWorkspace(archiveWorkspaceTarget.id);
      applyDesktopState(state);
      setProjectOverviewId(null);
      setArchiveWorkspaceTarget(null);
      setWorkspaceArchivePreview(null);
      setCopiedWorkspacePath(null);
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function openDeleteWorkspaceDialog(workspace: DesktopWorkspace) {
    setWorkspaceMenuId(null);
    setSidebarActionError(null);
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const preview = await client.previewWorkspaceDelete(workspace.id);
      setWorkspaceDeletePreview(preview);
      setDeleteWorkspaceTarget(workspace);
      setDeleteWorkspaceConfirmation("");
      setCopiedWorkspacePath(null);
    } catch (error) {
      setSidebarActionError(`Could not inspect “${workspace.title}”: ${errorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  }

  function closeDeleteWorkspaceDialog() {
    if (isBusy) return;
    setDeleteWorkspaceTarget(null);
    setWorkspaceDeletePreview(null);
    setWorkspaceLifecycleError(null);
    setDeleteWorkspaceConfirmation("");
    setCopiedWorkspacePath(null);
  }

  async function confirmDeleteWorkspace() {
    if (!deleteWorkspaceTarget || !workspaceDeletePreview) return;
    setWorkspaceLifecycleError(null);
    setIsBusy(true);
    try {
      const state = await client.deleteWorkspace({
        id: deleteWorkspaceTarget.id,
        confirmation: deleteWorkspaceConfirmation,
      });
      applyDesktopState(state);
      setProjectOverviewId(null);
      setDeleteWorkspaceTarget(null);
      setWorkspaceDeletePreview(null);
      setDeleteWorkspaceConfirmation("");
      setCopiedWorkspacePath(null);
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyWorkspacePath(pathValue: string) {
    try {
      await navigator.clipboard.writeText(pathValue);
      setCopiedWorkspacePath(pathValue);
    } catch (error) {
      setWorkspaceLifecycleError(errorMessage(error));
    }
  }

  async function revealOrCopyPath(pathValue: string) {
    if (kind === "web") {
      await navigator.clipboard.writeText(pathValue);
      setMessage("Server path copied.");
    } else {
      await client.revealPath(pathValue);
    }
  }

  async function addSourcesToProject(projectId: string) {
    try {
      const candidates = await client.chooseSourceFolders();
      if (candidates.length > 0) {
        setNewProjectSources(candidates.map((candidate) => ({ candidate, folderMode: "direct" })));
        setAddSourcesProjectId(projectId);
      }
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function confirmAddSources() {
    if (!addSourcesProjectId) return;
    setIsBusy(true);
    try {
      applyDesktopState(await client.addProjectSources(addSourcesProjectId, newProjectSources.map(projectSourceInput)));
      setAddSourcesProjectId(null);
      setNewProjectSources([]);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setIsBusy(false); }
  }

  async function confirmRemoveSource() {
    if (!removeSourceTarget) return;
    setIsBusy(true);
    setMessage(null);
    try {
      applyDesktopState(await client.removeProjectSource(removeSourceTarget.kind, removeSourceTarget.id));
      setRemoveSourceTarget(null);
    }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setIsBusy(false); }
  }

  function updateDraftPrompt(value: string) {
    setDraftPrompt(value);
    setSkillMenuDismissed(false);
  }

  function updateConversationPrompt(value: string) {
    setConversationPrompt(value);
    setSkillMenuDismissed(false);
  }

  function selectComposerSkill(skill: SkillSummary) {
    if (!activeSkillCommand || !skill.enabled) return;
    setSelectedSkillNames((current) => current.includes(skill.name) ? current : [...current, skill.name]);
    const prompt = removeSkillCommand(activePrompt, activeSkillCommand);
    if (selectedConversation) {
      setConversationPrompt(prompt);
      window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
    } else {
      setDraftPrompt(prompt);
    }
    setSkillMenuDismissed(false);
    setSkillMenuIndex(0);
  }

  function handleSkillMenuKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
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
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && composerAttachments.length === 0) {
      return;
    }

    const submittedAttachments = composerAttachments;
    const submittedSkills = selectedSkillNames;
    setIsBusy(true);
    setMessage(null);
    try {
      const provisionalTitle = titleFromPrompt(trimmedPrompt);
      const images = await Promise.all(submittedAttachments.map(attachmentToMessageImage));
      const result = await client.createConversationWithSession({
        projectId: desktopState.selectedProjectId,
        workspaceId: desktopState.selectedWorkspaceId,
        title: provisionalTitle,
        prompt: trimmedPrompt,
        skills: submittedSkills.length > 0 ? submittedSkills : undefined,
        images: images.length > 0 ? images : undefined,
        agent: selectedAgent,
        ...(selectedAgent === "codex"
          ? {
              model: selectedCodexModel,
              reasoningEffort: selectedCodexReasoningEffort,
            }
          : {
              profile: selectedProfile || undefined,
              approvalPolicy: selectedApprovalPolicy ?? "auto",
            }),
      });
      applyDesktopActionResult(result);
      if (result.error) {
        setMessage(result.error);
      } else {
        setDraftPrompt("");
        setSelectedSkillNames([]);
        clearComposerAttachments();
        void refreshSessions({ quiet: true });
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function selectAgent(agent: AgentKind) {
    if (selectedSession) return;
    setDraftAgent(agent);
  }

  function selectCodexModel(modelId: string) {
    if (selectedSession) return;
    setDraftCodexModel(modelId);
    const model = codexModels.find((candidate) => candidate.id === modelId);
    setDraftCodexReasoningEffort((current) => compatibleReasoningEffort(model?.supported_reasoning_efforts ?? [], current));
  }

  async function selectSessionCodexSettings(model: string, reasoningEffort: string) {
    if (!selectedSession || selectedAgent !== "codex") return;
    setIsBusy(true);
    setMessage(null);
    try {
      const session = await client.changeSessionCodexSettings(selectedSession.id, { model, reasoningEffort });
      setSessions((current) => upsertSession(current, session));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function selectProfile(profile: string) {
    if (!selectedSession) {
      setDraftProfile(profile);
      return;
    }

    setProfileOverrides((current) => ({ ...current, [selectedSession.id]: profile }));
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await client.changeSessionProfile(selectedSession.id, profile);
      setMessage(result.status === "pending" ? `Switching to ${profile} before the next model generation.` : `Profile changed to ${profile}.`);
      if (result.status === "applied") {
        const session = await client.getSession(selectedSession.id);
        setSessions((current) => upsertSession(current, session));
      }
      void refreshSessionItems(selectedBinding!, { quiet: true });
    } catch (error) {
      setProfileOverrides((current) => {
        const next = { ...current };
        delete next[selectedSession.id];
        return next;
      });
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function selectApprovalPolicy(approvalPolicy: ApprovalPolicy) {
    if (!selectedSession) {
      setDraftApprovalPolicy(approvalPolicy);
      return;
    }

    setApprovalPolicyOverrides((current) => ({ ...current, [selectedSession.id]: approvalPolicy }));
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await client.changeSessionApprovalPolicy(selectedSession.id, approvalPolicy);
      setMessage(
        result.status === "pending"
          ? `Switching access to ${approvalPolicyLabel(approvalPolicy)}.`
          : `Access changed to ${approvalPolicyLabel(approvalPolicy)}.`,
      );
      if (result.status === "applied") {
        const session = await client.getSession(selectedSession.id);
        setSessions((current) => upsertSession(current, session));
        setApprovalPolicyOverrides((current) => {
          const next = { ...current };
          delete next[selectedSession.id];
          return next;
        });
      }
      void refreshSessionItems(selectedBinding!, { quiet: true });
      void refreshSessions({ quiet: true });
    } catch (error) {
      setApprovalPolicyOverrides((current) => {
        const next = { ...current };
        if (next[selectedSession.id] === approvalPolicy) {
          delete next[selectedSession.id];
        }
        return next;
      });
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function submitSelectedPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = conversationPrompt.trim();
    if (!selectedConversation || runtimeOccupied || isBusy || (!text && composerAttachments.length === 0)) {
      return;
    }

    const conversationId = selectedConversation.id;
    const submittedAttachments = composerAttachments;
    const submittedSkills = selectedSkillNames;
    const optimisticId = `optimistic-prompt-${crypto.randomUUID()}`;
    const isSteering = Boolean(selectedSession?.working && sessionAllowsActiveTurn(selectedSession.state));
    const optimisticItem = optimisticPromptDisplayItem({
      id: optimisticId,
      text,
      images: submittedAttachments.map((attachment) => ({
        url: attachment.url,
        mime_type: attachment.mimeType,
      })),
      steering: isSteering,
      skills: submittedSkills,
      createdAt: new Date().toISOString(),
    });
    const revokeSubmittedAttachments = () => {
      for (const attachment of submittedAttachments) {
        if (attachment.url) URL.revokeObjectURL(attachment.url);
      }
    };

    setStickToBottom(true);
    setIsBusy(true);
    setMessage(null);
    setOptimisticPromptItems((current) => [...current, optimisticItem]);
    setConversationPrompt("");
    setSelectedSkillNames([]);
    setPreviewAttachmentId(null);
    setAttachmentMenuOpen(false);
    setComposerAttachments([]);
    if (selectedSession) {
      setSessions((current) => upsertSession(current, {
        ...selectedSession,
        state: isSteering ? selectedSession.state : "starting",
        working: true,
      }));
    }
    try {
      const images = await Promise.all(submittedAttachments.map(attachmentToMessageImage));
      const result = await client.sendConversationMessage({
        conversationId,
        text,
        skills: submittedSkills.length > 0 ? submittedSkills : undefined,
        images: images.length > 0 ? images : undefined,
        approvalPolicy: selectedSession ? undefined : selectedApprovalPolicy ?? "auto",
      });
      applyDesktopActionResult(result);
      if (result.error) {
        setOptimisticPromptItems((current) => current.filter((item) => item.id !== optimisticId));
        if (selectedConversationIdRef.current === conversationId) {
          setConversationPrompt((current) => current || text);
          setSelectedSkillNames((current) => current.length === 0 ? submittedSkills : current);
          setComposerAttachments((current) => current.length === 0 ? submittedAttachments : current);
        } else {
          revokeSubmittedAttachments();
        }
        if (result.errorCode === "runtime_occupied") {
          await refreshSessions({ quiet: true });
        } else {
          setMessage(result.error);
        }
      } else {
        const command = result.command;
        if (!command) {
          throw new Error("Message response did not include a command.");
        }
        setOptimisticPromptItems((current) => current.flatMap((item) => {
          if (item.id !== optimisticId) return [item];
          const acknowledged = acknowledgeOptimisticPrompt(item, command, sessionItemsRef.current);
          return acknowledged ? [acknowledged] : [];
        }));
        requestAnimationFrame(revokeSubmittedAttachments);
        void refreshSessions({ quiet: true });
      }
    } catch (error) {
      setOptimisticPromptItems((current) => current.filter((item) => item.id !== optimisticId));
      if (selectedConversationIdRef.current === conversationId) {
        setConversationPrompt((current) => current || text);
        setSelectedSkillNames((current) => current.length === 0 ? submittedSkills : current);
        setComposerAttachments((current) => current.length === 0 ? submittedAttachments : current);
      } else {
        revokeSubmittedAttachments();
      }
      setMessage(errorMessage(error));
      void refreshSessions({ quiet: true });
    } finally {
      setIsBusy(false);
    }
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
    if (!selectedBinding || submittingApprovalId) return;
    setSubmittingApprovalId(approvalId);
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
      setSubmittingApprovalId(null);
    }
  }, [selectedBinding, submittingApprovalId]);

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (handleSkillMenuKeyDown(event)) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleNewPromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (handleSkillMenuKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = clipboardImageFiles(event.clipboardData);
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
    const unsupportedCount = files.filter((file) => !supportedImageTypes.has(file.type)).length;
    const imageFiles = files.filter((file) => supportedImageTypes.has(file.type));
    if (unsupportedCount > 0) {
      setMessage("Only PNG, JPEG, and WebP images can be attached.");
    }
    if (imageFiles.length === 0) {
      return;
    }
    const remainingSlots = Math.max(0, maxMessageImageCount - composerAttachments.length);
    if (remainingSlots === 0) {
      setMessage(`A message can include at most ${maxMessageImageCount} images.`);
      return;
    }
    if (imageFiles.length > remainingSlots) {
      setMessage(`A message can include at most ${maxMessageImageCount} images.`);
    }
    const acceptedFiles: File[] = [];
    const acceptedSizes = composerAttachments.map((attachment) => attachment.file.size);
    let sizeError: string | null = null;
    for (const file of imageFiles.slice(0, remainingSlots)) {
      const error = messageImageSizeError([...acceptedSizes, file.size]);
      if (error) {
        sizeError ??= error;
        continue;
      }
      acceptedFiles.push(file);
      acceptedSizes.push(file.size);
    }
    if (sizeError) setMessage(sizeError);
    const attachments: ComposerAttachment[] = acceptedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      kind: "image",
      name: file.name || "Pasted image",
      file,
      mimeType: file.type,
      url: URL.createObjectURL(file),
    }));
    setComposerAttachments((current) => [
      ...current,
      ...attachments,
    ]);
  }

  function removeComposerAttachment(id: string) {
    setComposerAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return current.filter((item) => item.id !== id);
    });
    setPreviewAttachmentId((current) => (current === id ? null : current));
  }

  function clearComposerAttachments() {
    setPreviewAttachmentId(null);
    setComposerAttachments((current) => {
      for (const attachment of current) {
        if (attachment.url) {
          URL.revokeObjectURL(attachment.url);
        }
      }
      return [];
    });
  }

  function handleAttachmentInputChange(event: SyntheticEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    addComposerAttachments(Array.from(input.files ?? []));
    input.value = "";
    setAttachmentMenuOpen(false);
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
        setMessage("Stopping the current turn…");
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
    setStickToBottom(isNearScrollBottom(element));
    if (element.scrollTop <= 80) {
      void loadOlderSessionItems();
    }
  }

  function handleConversationWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const nextValue = conversationAutoFollowAfterWheel(stickToBottomRef.current, event.deltaY);
    if (nextValue === stickToBottomRef.current) {
      return;
    }
    cancelScheduledConversationAutoScroll();
    setStickToBottom(nextValue);
  }

  async function loadOlderSessionItems() {
    const element = conversationScrollRef.current;
    const binding = selectedBinding;
    const cursor = sessionItemsPrevCursorRef.current;
    if (!element || !binding || !cursor || olderSessionItemsLoadingRef.current) {
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
      setSessionItems((current) => mergeDisplayItems(current, response.items));
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

  function resizeConversationTextarea() {
    resizeTextareaToContent(composerTextareaRef.current);
  }

  function applyDesktopActionResult(result: DesktopActionResult) {
    applyDesktopState(result.state);
    const session = result.session;
    if (session) {
      setSessions((current) => upsertSession(current, session));
      setConnectionState("online");
    }
  }

  async function toggleConversationPinned(conversation: DesktopConversation) {
    try {
      applyDesktopState(await client.setConversationPinned(conversation.id, !conversation.pinned_at));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function archiveConversation(conversation: DesktopConversation) {
    setSidebarActionError(null);
    try {
      applyDesktopState(await client.archiveConversation(conversation.id));
    } catch (error) {
      setSidebarActionError(`Could not archive “${conversation.title}”: ${errorMessage(error)}`);
    }
  }

  function beginConversationTitleEdit() {
    if (!selectedConversation) {
      return;
    }
    setMessage(null);
    setConversationTitleDraft(selectedConversation.title);
    setIsEditingConversationTitle(true);
  }

  function cancelConversationTitleEdit() {
    setConversationTitleDraft(selectedConversation?.title ?? "");
    setIsEditingConversationTitle(false);
  }

  async function persistConversationTitle(conversationId: string, draft: string): Promise<string | null> {
    if (isSavingConversationTitle) {
      return null;
    }
    const title = draft.trim();
    if (!title) {
      setMessage("Conversation title is required.");
      return null;
    }

    setIsSavingConversationTitle(true);
    setMessage(null);
    try {
      applyDesktopState(await client.renameConversation(conversationId, title));
      return title;
    } catch (error) {
      setMessage(errorMessage(error));
      return null;
    } finally {
      setIsSavingConversationTitle(false);
    }
  }

  async function saveConversationTitle() {
    if (!selectedConversation) {
      return;
    }
    if (conversationTitleDraft.trim() === selectedConversation.title) {
      setIsEditingConversationTitle(false);
      return;
    }
    const title = await persistConversationTitle(selectedConversation.id, conversationTitleDraft);
    if (title) {
      setConversationTitleDraft(title);
      setIsEditingConversationTitle(false);
    } else {
      conversationTitleInputRef.current?.focus();
    }
  }

  function openRenameConversationDialog(conversation: DesktopConversation) {
    setMessage(null);
    setRenameDialogConversationId(conversation.id);
    setRenameDialogTitleDraft(conversation.title);
  }

  function closeRenameConversationDialog() {
    if (isSavingConversationTitle) {
      return;
    }
    setRenameDialogConversationId(null);
    setRenameDialogTitleDraft("");
  }

  async function submitRenameConversationDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameDialogConversation) {
      return;
    }
    if (renameDialogTitleDraft.trim() === renameDialogConversation.title) {
      closeRenameConversationDialog();
      return;
    }
    const title = await persistConversationTitle(renameDialogConversation.id, renameDialogTitleDraft);
    if (title) {
      closeRenameConversationDialog();
    }
  }

  function openRenameProjectDialog(project: DesktopProject) {
    setProjectMenuId(null);
    setMessage(null);
    setRenameDialogProjectId(project.id);
    setRenameDialogProjectNameDraft(project.name);
  }

  function closeRenameProjectDialog() {
    if (isSavingProjectName) return;
    setRenameDialogProjectId(null);
    setRenameDialogProjectNameDraft("");
  }

  async function submitRenameProjectDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameDialogProject || isSavingProjectName) return;
    const name = renameDialogProjectNameDraft.trim();
    if (!name) {
      setMessage("Project name is required.");
      return;
    }
    if (name === renameDialogProject.name) {
      closeRenameProjectDialog();
      return;
    }

    setIsSavingProjectName(true);
    setMessage(null);
    try {
      applyDesktopState(await client.renameProject(renameDialogProject.id, name));
      setRenameDialogProjectId(null);
      setRenameDialogProjectNameDraft("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsSavingProjectName(false);
    }
  }

  function toggleWorkspaceCollapsed(id: string) {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openRenameWorkspaceDialog(workspace: DesktopWorkspace) {
    setWorkspaceMenuId(null);
    setMessage(null);
    setRenameDialogWorkspaceId(workspace.id);
    setRenameDialogWorkspaceTitleDraft(workspace.title);
  }

  function closeRenameWorkspaceDialog() {
    if (isSavingWorkspaceTitle) return;
    setRenameDialogWorkspaceId(null);
    setRenameDialogWorkspaceTitleDraft("");
  }

  async function submitRenameWorkspaceDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameDialogWorkspace || isSavingWorkspaceTitle) return;
    const title = renameDialogWorkspaceTitleDraft.trim();
    if (!title) {
      setMessage("Workspace name is required.");
      return;
    }
    if (title === renameDialogWorkspace.title) {
      closeRenameWorkspaceDialog();
      return;
    }

    setIsSavingWorkspaceTitle(true);
    setMessage(null);
    try {
      applyDesktopState(await client.renameWorkspace(renameDialogWorkspace.id, title));
      setRenameDialogWorkspaceId(null);
      setRenameDialogWorkspaceTitleDraft("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsSavingWorkspaceTitle(false);
    }
  }

  function scheduleFileSave(filePath: string) {
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
    if (!existing || existing.file.readOnly || existing.draft === draft) return;
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
    if (!existing || existing.mode === mode) return;
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
    if (!current || current.file.readOnly || current.saveStatus === "clean") return true;
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
        sessionId: selectedSession?.id,
      });
      const existing = openFilesRef.current[filePath];
      if (!existing) return true;
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
      if (existing) {
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
      delete next[tab.path];
      openFilesRef.current = next;
      setOpenFiles(next);
    }
    setSidePanelTabs((state) => closeSidePanelTab(state, tabId));
  }

  async function handleMarkdownLinkClick(event: ReactMouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>(".markdown-copy a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) return;
    event.preventDefault();
    const fileContainer = anchor.closest<HTMLElement>("[data-markdown-file]");
    const expectedSessionId = selectedSession?.id ?? null;
    try {
      const result = await client.openMarkdownLink({
        href,
        basePath: fileContainer?.dataset.markdownFile
          ?? selectedSession?.working_directory
          ?? selectedWorkspace?.root_path
          ?? null,
        baseKind: fileContainer ? "file" : "directory",
        sessionId: selectedSession?.id,
      });
      if (result.kind === "anchor") {
        document.getElementById(result.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (result.kind !== "text") return;
      if (selectedSessionIdRef.current !== expectedSessionId) return;
      if (!openFilesRef.current[result.file.path]) {
        const next = {
          ...openFilesRef.current,
          [result.file.path]: {
            file: result.file,
            draft: result.file.content,
            mode: isMarkdownFile(result.file.path) ? "preview" as const : "source" as const,
            saveStatus: "clean" as const,
          },
        };
        openFilesRef.current = next;
        setOpenFiles(next);
      }
      setSidePanelTabs((state) => openSidePanelTab(
        state,
        fileSidePanelTab(result.file.path, result.line, result.column),
      ));
    } catch (error) {
      setMessage(errorMessage(error));
    }
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

  const activeSidePanelTab = sidePanelTabs.tabs.find((tab) => tab.id === sidePanelTabs.activeTabId) ?? null;

  return (
    <main
      ref={appFrameRef}
      className={`app-frame ${webNavigationOpen ? "web-navigation-open" : ""} ${sidePanelTabs.activeTabId ? "has-subagent-panel" : ""} ${isSidePanelResizing ? "resizing-side-panel" : ""}`}
      style={{ "--side-panel-width": `${sidePanelWidth}px` } as React.CSSProperties}
      onClickCapture={(event) => void handleMarkdownLinkClick(event)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && webNavigationOpen && !(event.target as Element).closest("dialog")) {
          event.preventDefault(); setWebNavigationOpen(false);
        }
      }}
    >
      {searchOpen && <SearchPalette state={desktopState} onClose={() => setSearchOpen(false)} onSelect={selectConversation} onNewConversation={() => void openNewConversation()} onNewProject={openCreateProjectDialog} />}
      <aside className="sidebar">
        {kind === "web" && <button ref={webNavigationCloseButton} className="web-navigation-toggle" type="button" onClick={() => setWebNavigationOpen(false)} aria-label="Close navigation"><X size={18} />Close navigation</button>}
        <div className="sidebar-chrome" aria-hidden="true">
          <PanelLeft size={14} strokeWidth={1.8} />
          <ArrowLeft size={14} strokeWidth={1.8} />
          <ArrowRight size={14} strokeWidth={1.8} />
        </div>

        <div className="sidebar-brand">
          <HostMenu />
          <div className="brand-actions">
            <button type="button" aria-label="Search" onClick={() => setSearchOpen(true)} title="Search (⌘K / Ctrl+K)"><Search size={15} strokeWidth={1.8} /></button>
            <button type="button" aria-label="Notifications" disabled title="Notifications are not available yet"><Bell size={15} strokeWidth={1.8} /></button>
          </div>
        </div>

        <nav className="utility-nav" aria-label="Navigation">
          <button type="button" onClick={() => void openNewConversation()} disabled={isBusy}>
            <SquarePen size={15} strokeWidth={1.8} />
            New session
          </button>
          <button type="button" onClick={() => void refreshSessions({ syncCodex: true })} disabled={isBusy}>
            <RefreshCw size={15} strokeWidth={1.8} />
            Sync
          </button>
          <button type="button" disabled className="utility-placeholder">
            <CalendarClock size={15} strokeWidth={1.8} />
            Scheduled
          </button>
          <button type="button" disabled className="utility-placeholder">
            <Blocks size={15} strokeWidth={1.8} />
            Plugins
          </button>
        </nav>

        <section className="sidebar-section" aria-label="Pinned conversations">
          <div className="sidebar-section-title">Pinned</div>
          {pinnedConversations.length === 0 ? (
            <p className="sidebar-empty">No pinned sessions</p>
          ) : (
            <div className="sidebar-session-list">
              {pinnedConversations.map((conversation) => (
                <ConversationNavItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === selectedConversation?.id}
                  working={workingConversationIds.has(conversation.id)}
                  onSelect={() => void selectConversation(conversation.id)}
                  onRename={() => openRenameConversationDialog(conversation)}
                  onPin={() => void toggleConversationPinned(conversation)}
                  onArchive={() => void archiveConversation(conversation)}
                  sort={sidebarSortProps(
                    { kind: "pinned-session", id: conversation.id, scopeId: "pinned" },
                    pinnedConversations.map((candidate) => candidate.id),
                  )}
                />
              ))}
            </div>
          )}
        </section>

        <section ref={projectsSectionRef} className="sidebar-section projects-section" aria-label="Projects">
          <div className="project-section-heading">
            <span className="sidebar-section-title">Projects</span>
            <div>
              <button type="button" onClick={openCreateProjectDialog} disabled={isBusy} aria-label="Add project">
                <FolderPlus size={15} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {desktopState.projects.length === 0 ? (
            <p className="sidebar-empty">No projects yet</p>
          ) : (
            <>
              {desktopState.projects.map((project) => {
                const projectConversations = desktopState.conversations.filter(
                  (conversation) => conversation.project_id === project.id,
                );
                const projectWorkspaces = desktopState.workspaces.filter(
                  (workspace) => workspace.project_id === project.id,
                );
                const isOpen = projectOpenIds.has(project.id);
                const projectSort = sidebarSortProps(
                  { kind: "project", id: project.id, scopeId: "projects" },
                  desktopState.projects.map((candidate) => candidate.id),
                );
                return (
                  <div className="project-group" key={project.id}>
                    <div
                      className={`project-row-shell ${projectSort.dragging ? "dragging" : ""} ${projectSort.dropPosition ? `drop-${projectSort.dropPosition}` : ""}`}
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
                        aria-label={`${isOpen ? "Collapse" : "Expand"} ${project.name}`}
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
                          aria-label={`More actions for ${project.name}`}
                          aria-expanded={projectMenuId === project.id}
                        >
                          <MoreHorizontal size={14} strokeWidth={1.8} />
                        </button>
                        {projectMenuId === project.id && (
                          <div
                            ref={sidebarActionMenuRef}
                            className={`workspace-action-menu project-action-menu ${sidebarActionMenuOpensUp ? "opens-up" : ""}`}
                            role="menu"
                          >
                            <button type="button" role="menuitem" onClick={() => { setProjectMenuId(null); void openProjectOverview(project); }}>
                              <FileText size={13} strokeWidth={1.8} />
                              <span>Open overview</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setProjectMenuId(null); void addSourcesToProject(project.id); }}>
                              <FolderPlus size={13} strokeWidth={1.8} />
                              <span>Add Sources</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => openRenameProjectDialog(project)}>
                              <SquarePen size={13} strokeWidth={1.8} />
                              <span>Rename</span>
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => openCreateWorkspaceDialog(project)}
                          disabled={isBusy}
                          aria-label={`New workspace in ${project.name}`}
                          title="New workspace"
                        >
                          <FolderPlus size={14} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="workspace-list">
                        {projectWorkspaces.map((workspace) => {
                          const workspaceConversations = projectConversations.filter(
                            (conversation) => conversation.workspace_id === workspace.id,
                          );
                          const workspaceSort = sidebarSortProps(
                            { kind: "workspace", id: workspace.id, scopeId: project.id },
                            projectWorkspaces.map((candidate) => candidate.id),
                          );
                          const workspaceOpen = !collapsedWorkspaceIds.has(workspace.id);
                          return (
                            <div className="workspace-group" key={workspace.id}>
                              <div
                                className={`workspace-row-shell ${workspaceSort.dragging ? "dragging" : ""} ${workspaceSort.dropPosition ? `drop-${workspaceSort.dropPosition}` : ""}`}
                                draggable={workspaceSort.draggable}
                                onDragStart={workspaceSort.onDragStart}
                                onDragOver={workspaceSort.onDragOver}
                                onDrop={workspaceSort.onDrop}
                                onDragEnd={workspaceSort.onDragEnd}
                              >
                                <button
                                  type="button"
                                  className="workspace-collapse-button"
                                  onClick={() => toggleWorkspaceCollapsed(workspace.id)}
                                  aria-label={`${workspaceOpen ? "Collapse" : "Expand"} ${workspace.title}`}
                                  aria-expanded={workspaceOpen}
                                >
                                  <WorkspaceDisclosureIcon open={workspaceOpen} />
                                </button>
                                <button
                                  type="button"
                                  className={`workspace-row ${workspace.id === selectedWorkspace?.id && !selectedConversation ? "selected" : ""}`}
                                  onClick={() => toggleWorkspaceCollapsed(workspace.id)}
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
                                      aria-label={`More actions for ${workspace.title}`}
                                      aria-expanded={workspaceMenuId === workspace.id}
                                    >
                                      <MoreHorizontal size={14} strokeWidth={1.8} />
                                    </button>
                                    {workspaceMenuId === workspace.id && (
                                      <div
                                        ref={sidebarActionMenuRef}
                                        className={`workspace-action-menu ${sidebarActionMenuOpensUp ? "opens-up" : ""}`}
                                        role="menu"
                                      >
                                        {kind === "desktop" && <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setWorkspaceMenuId(null);
                                            void client.revealPath(workspace.root_path).catch((error) => setMessage(errorMessage(error)));
                                          }}
                                        >
                                          <FolderOpen size={13} strokeWidth={1.8} />
                                          <span>Open in Finder</span>
                                        </button>}
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setWorkspaceMenuId(null);
                                            void copyWorkspacePath(workspace.root_path);
                                          }}
                                        >
                                          <Copy size={13} strokeWidth={1.8} />
                                          <span>{kind === "web" ? "Copy server path" : "Copy absolute path"}</span>
                                        </button>
                                        <div className="workspace-action-menu-separator" role="separator" />
                                        <button type="button" role="menuitem" onClick={() => openRenameWorkspaceDialog(workspace)}>
                                          <SquarePen size={13} strokeWidth={1.8} />
                                          <span>Rename</span>
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => void openArchiveWorkspaceDialog(workspace)}>
                                          <Archive size={13} strokeWidth={1.8} />
                                          <span>Archive</span>
                                        </button>
                                        <button type="button" role="menuitem" className="destructive" onClick={() => void openDeleteWorkspaceDialog(workspace)}>
                                          <Trash2 size={13} strokeWidth={1.8} />
                                          <span>Delete</span>
                                        </button>
                                      </div>
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
                                      aria-label={workspace.status === "error" ? `Retry ${workspace.title}` : `New session in ${workspace.title}`}
                                      title={workspace.status === "error" ? "Retry workspace" : "New session"}
                                    >
                                      {workspace.status === "error" ? <RefreshCw size={13} strokeWidth={1.8} /> : <SquarePen size={13} strokeWidth={1.8} />}
                                    </button>
                                  </div>
                                )}
                              </div>
                              {workspaceOpen && workspaceConversations.length > 0 && (
                                <div className="sidebar-session-list workspace-sessions">
                                  {workspaceConversations.map((conversation) => (
                                    <ConversationNavItem
                                      key={conversation.id}
                                      conversation={conversation}
                                      selected={conversation.id === selectedConversation?.id}
                                      working={workingConversationIds.has(conversation.id)}
                                      onSelect={() => void selectConversation(conversation.id)}
                                      onRename={() => openRenameConversationDialog(conversation)}
                                      onPin={() => void toggleConversationPinned(conversation)}
                                      onArchive={() => void archiveConversation(conversation)}
                                      sort={sidebarSortProps(
                                        { kind: "workspace-session", id: conversation.id, scopeId: workspace.id },
                                        workspaceConversations.map((candidate) => candidate.id),
                                      )}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {projectWorkspaces.length === 0 && (
                          <button
                            type="button"
                            className="workspace-empty-action"
                            onClick={() => openCreateWorkspaceDialog(project)}
                          >
                            <Plus size={13} /> Create workspace
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {previousConversations.length > 0 && (
                <div className="previous-sessions-group">
                  <span className="sidebar-section-title">Previous sessions</span>
                  <div className="sidebar-session-list">
                  {previousConversations.map((conversation) => (
                    <ConversationNavItem
                      key={conversation.id}
                      conversation={conversation}
                      selected={conversation.id === selectedConversation?.id}
                      working={workingConversationIds.has(conversation.id)}
                      onSelect={() => void selectConversation(conversation.id)}
                      onRename={() => openRenameConversationDialog(conversation)}
                      onPin={() => void toggleConversationPinned(conversation)}
                      onArchive={() => void archiveConversation(conversation)}
                    />
                  ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {sidebarActionError && (
          <div className="sidebar-action-error" role="alert">
            <ShieldAlert size={14} strokeWidth={1.8} />
            <span>{sidebarActionError}</span>
            <button type="button" onClick={() => setSidebarActionError(null)} aria-label="Dismiss archive error">
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="user-chip">ZT</div>
          <div>
            <strong>Zotigo</strong>
            <span>{connectionLabel(connectionState)}</span>
          </div>
          {signOut && <button type="button" onClick={() => void signOut().catch((error) => setMessage(errorMessage(error)))}>Sign out</button>}
        </div>
      </aside>

      <section className={`conversation ${selectedConversation ? "has-composer has-inspector" : ""}`}>
        <header className="conversation-titlebar">
          {kind === "web" && <button ref={webNavigationButton} className="web-navigation-toggle" type="button" onClick={() => setWebNavigationOpen(true)} aria-label="Open navigation" aria-expanded={webNavigationOpen}><PanelLeft size={18} /></button>}
          {selectedConversation ? (
            <>
              <div className="title-with-icon">
                <FileText className="doc-icon" size={15} strokeWidth={1.8} />
                {isEditingConversationTitle ? (
                  <input
                    ref={conversationTitleInputRef}
                    className="conversation-title-input"
                    value={conversationTitleDraft}
                    disabled={isSavingConversationTitle}
                    onChange={(event) => setConversationTitleDraft(event.target.value)}
                    onBlur={() => void saveConversationTitle()}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) {
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveConversationTitle();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelConversationTitleEdit();
                      }
                    }}
                    aria-label="Conversation title"
                  />
                ) : (
                  <button
                    type="button"
                    className="conversation-title-button"
                    onDoubleClick={beginConversationTitleEdit}
                    title="Rename conversation"
                  >
                    <h1>{selectedConversation.title}</h1>
                  </button>
                )}
              </div>
              <button type="button" className="icon-button" aria-label="More actions" disabled title="More actions are not available yet">
                <MoreHorizontal size={17} strokeWidth={1.8} />
              </button>
            </>
          ) : null}
        </header>

        <div
          ref={conversationScrollRef}
          className={`conversation-scroll ${selectedConversation ? "" : "new-chat-scroll"}`}
          onScroll={handleConversationScroll}
          onWheel={handleConversationWheel}
        >
          <article className="conversation-body">
            {selectedConversation ? (
              <SessionTimeline
                binding={selectedBinding}
                session={selectedSession}
                items={timelineItems}
                itemsLoading={sessionItemsLoading}
                itemsError={sessionItemsError}
                message={message}
                daemonUrl={daemonUrl}
                submittingApprovalId={submittingApprovalId}
                onSubmitApproval={submitApproval}
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
                onOpenPath={kind === "desktop" ? (targetPath) => void client.revealPath(targetPath).catch((error) => setMessage(errorMessage(error))) : undefined}
              />
            ) : (
              <NewSessionPrompt
                selectedProject={selectedProject}
                selectedWorkspace={selectedWorkspace}
                requiresWorkspace={selectedAgent === "codex"
                  ? selectedWorkspace?.status !== "ready"
                  : Boolean(selectedProject && selectedWorkspace?.status !== "ready")}
                message={message}
                isBusy={isBusy}
                prompt={draftPrompt}
                skills={skillMatches}
                selectedSkillNames={selectedSkillNames}
                skillsLoading={skillsLoading}
                skillsError={skillsError}
                skillMenuOpen={skillMenuOpen}
                skillMenuIndex={skillMenuIndex}
                attachments={composerAttachments}
                onPromptChange={updateDraftPrompt}
                onPromptKeyDown={handleNewPromptKeyDown}
                onSelectSkill={selectComposerSkill}
                onRemoveSkill={(name) => setSelectedSkillNames((current) => current.filter((item) => item !== name))}
                onHighlightSkill={setSkillMenuIndex}
                onPromptPaste={handleComposerPaste}
                onPreviewAttachment={setPreviewAttachmentId}
                onRemoveAttachment={removeComposerAttachment}
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
                onSelectProfile={(profile) => void selectProfile(profile)}
                agents={runtimeAgents}
                agentsLoading={runtimeAgentsLoading}
                selectedAgent={selectedAgent}
                onSelectAgent={selectAgent}
                codexModels={codexModels}
                selectedCodexModel={selectedCodexModel}
                selectedCodexReasoningEffort={selectedCodexReasoningEffort}
                onSelectCodexModel={selectCodexModel}
                onSelectCodexReasoningEffort={setDraftCodexReasoningEffort}
                selectedApprovalPolicy={draftApprovalPolicy}
                onSelectApprovalPolicy={(approvalPolicy) => void selectApprovalPolicy(approvalPolicy)}
                runtimeAvailable={true}
              />
            )}
          </article>
        </div>

        {selectedConversation && !isConversationAtBottom && (
          <button
            type="button"
            className="scroll-to-bottom-button"
            aria-label="Scroll to latest message"
            onClick={() => scrollConversationToBottom({ smooth: true })}
          >
            <ArrowDown size={17} strokeWidth={2} />
          </button>
        )}

        {selectedConversation && (
          <div className="composer-shell">
            {runtimeOccupied && (
              <div className="runtime-occupied-notice" role="status">
                <ShieldAlert size={18} strokeWidth={1.9} />
                <div>
                  <strong>This task is open in Codex.</strong>
                  <span>Exit it there and return here to continue, or check again now.</span>
                </div>
                <button type="button" onClick={() => void retryRuntimeOccupiedSession()} disabled={isBusy}>
                  {isBusy ? "Checking..." : "Check again"}
                </button>
              </div>
            )}
            <form className="composer" onSubmit={(event) => void submitSelectedPrompt(event)}>
              <ComposerSkills
                skills={skillMatches}
                selectedSkillNames={selectedSkillNames}
                loading={skillsLoading}
                error={skillsError}
                open={skillMenuOpen}
                activeIndex={skillMenuIndex}
                onSelect={selectComposerSkill}
                onRemove={(name) => setSelectedSkillNames((current) => current.filter((item) => item !== name))}
                onHighlight={setSkillMenuIndex}
              />
              <ComposerAttachmentStrip
                attachments={composerAttachments}
                onPreview={setPreviewAttachmentId}
                onRemove={removeComposerAttachment}
              />
              <textarea
                ref={composerTextareaRef}
                value={conversationPrompt}
                onChange={(event) => updateConversationPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                onPaste={handleComposerPaste}
                placeholder="Ask follow-up changes"
                rows={2}
              />
              <input
                ref={attachmentInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={handleAttachmentInputChange}
              />
              <div className="composer-actions">
                <div className="composer-actions-left">
                  <div className="composer-add-wrap">
                    <button
                      type="button"
                      className="composer-icon-button"
                      aria-label="Add attachment"
                      aria-expanded={attachmentMenuOpen}
                      onClick={() => setAttachmentMenuOpen((open) => !open)}
                    >
                      <Plus size={20} strokeWidth={1.8} />
                    </button>
                    {attachmentMenuOpen && (
                      <div className="attachment-menu" role="menu">
                        <div className="attachment-menu-label">Add</div>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            attachmentInputRef.current?.click();
                          }}
                        >
                          <Paperclip size={16} strokeWidth={1.8} />
                          Images
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            composerTextareaRef.current?.focus();
                          }}
                        >
                          <Image size={16} strokeWidth={1.8} />
                          Paste image
                          <small>⌘V</small>
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedAgent === "zotigo" && (
                    <ApprovalPolicyPicker
                      value={selectedApprovalPolicy}
                      onChange={(approvalPolicy) => void selectApprovalPolicy(approvalPolicy)}
                      disabled={isBusy || hasActiveTurn || selectedApprovalPolicy === null}
                    />
                  )}
                </div>
                <div className="composer-actions-right">
                  {selectedAgent === "codex" ? (
                    <RuntimeSettingsPicker
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
                      agents={runtimeAgents}
                      selectedAgent="zotigo"
                      onSelectAgent={() => {}}
                      profiles={profiles}
                      selectedProfile={selectedProfile}
                      onSelectProfile={(profile) => void selectProfile(profile)}
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
                      aria-label={pauseRequestedTurnId === selectedActiveTurnId ? "Stop requested" : "Stop running turn"}
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
                      aria-label="Send message"
                    >
                      <ArrowUp size={16} strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        )}

        {previewAttachment?.kind === "image" && previewAttachment.url && (
          <ImagePreview key={previewAttachment.url} src={previewAttachment.url} alt={previewAttachment.name} onClose={() => setPreviewAttachmentId(null)} />
        )}
      </section>

      {selectedConversation && <aside className="inspector">
        <section className="inspector-card">
          <div className="inspector-heading">
            <h2>Environment</h2>
            <button type="button" className="icon-button" aria-label="Refresh environment" onClick={() => void refreshSessions({ syncCodex: true })} disabled={isBusy}>
              <RefreshCw size={14} strokeWidth={1.8} />
            </button>
          </div>

          <div className="env-list">
            <div className="env-row">
              <Server className="env-icon" size={15} strokeWidth={1.8} />
              <span>Daemon</span>
              <StatusPill state={connectionState} />
            </div>
            <div className="env-row">
              <Laptop className="env-icon" size={15} strokeWidth={1.8} />
              <span>Local</span>
              <ChevronDown className="env-chevron" size={14} strokeWidth={1.8} />
            </div>
            <div className="env-row">
              <Folder className="env-icon" size={15} strokeWidth={1.8} />
              <span>{selectedProject?.name ?? "Scratch"}</span>
              {selectedWorkspace?.root_path && (
                <span className="env-row-actions">
                  <button type="button" className="icon-button" title="Copy Workspace path" aria-label="Copy Workspace path" onClick={() => void copyWorkspacePath(selectedWorkspace.root_path)}>
                    {copiedWorkspacePath === selectedWorkspace.root_path ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
                  </button>
                  <button type="button" className="icon-button" title={pathActionLabel} aria-label={kind === "web" ? "Copy working directory path" : "Open working directory"} onClick={() => void revealOrCopyPath(selectedWorkspace.root_path).catch((error) => setMessage(errorMessage(error)))}>
                    <FolderOpen size={14} />
                  </button>
                </span>
              )}
            </div>
            <div className="env-row">
              <GitBranch className="env-icon" size={15} strokeWidth={1.8} />
              <span>{selectedWorkspace?.title ?? "No Workspace"}</span>
            </div>
          </div>

          {subagentRuns.length > 0 && (
            <>
              <div className="inspector-divider" />
              <button type="button" className="subagent-summary-button" onClick={() => setSidePanelTabs((state) => openSidePanelTab(state, { id: "subagents", kind: "subagents" }))}>
                <span>
                  <strong>Subagents</strong>
                  <small>{subagentRuns.filter((run) => run.status === "running").length} active · {subagentRuns.filter((run) => run.status !== "running").length} done</small>
                </span>
                <span className="subagent-avatar-stack" aria-hidden="true">
                  {subagentRuns.slice(0, 4).map((run) => <SubagentAvatar key={run.id} run={run} compact />)}
                </span>
                <ChevronRight size={14} strokeWidth={1.8} />
              </button>
            </>
          )}

          {selectedConversation && (
            <>
              <div className="inspector-divider" />
              <div className="inspector-subheading">
                <span>Session</span>
                <button type="button" className="icon-button" onClick={() => void toggleConversationPinned(selectedConversation)} aria-label={selectedConversation.pinned_at ? "Unpin session" : "Pin session"}>
                  <Pin size={14} strokeWidth={1.8} fill={selectedConversation.pinned_at ? "currentColor" : "none"} />
                </button>
              </div>
              <dl className="detail-list">
              <div>
                <dt>Conversation</dt>
                <dd>{selectedConversation.title}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{projectForConversation(selectedConversation, desktopState.projects)?.name ?? "No project"}</dd>
              </div>
              <div>
                <dt>Daemon ID</dt>
                <dd className="mono">{selectedBinding?.daemon_session_id ?? "Not bound"}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>
                  {selectedSession ? (
                    <StateBadge
                      state={
                        selectedSession.state === "running" && !sessionItemsLoading && !hasActiveTurn
                          ? "idle"
                          : selectedSession.state
                      }
                    />
                  ) : (
                    "Not bound"
                  )}
                </dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>{selectedAgent === "codex" ? "Codex" : "Zotigo"}</dd>
              </div>
              {selectedAgent === "codex" ? (
                <>
                  <div>
                    <dt>Model</dt>
                    <dd>{codexModelLabel(codexModels, selectedCodexModel)}</dd>
                  </div>
                  <div>
                    <dt>Thinking</dt>
                    <dd>{selectedCodexReasoningEffort || "Not available"}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Profile</dt>
                    <dd>{selectedProfile || "Not available"}</dd>
                  </div>
                  <div>
                    <dt>Access</dt>
                    <dd>{approvalPolicyLabel(selectedApprovalPolicy)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Created</dt>
                <dd>{selectedSession ? formatDateTime(selectedSession.created_at) : formatDateTime(selectedConversation.created_at)}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{selectedSession?.started_at ? formatDateTime(selectedSession.started_at) : "Not started"}</dd>
              </div>
              <div>
                <dt>Ended</dt>
                <dd>{selectedSession?.ended_at ? formatDateTime(selectedSession.ended_at) : "Not ended"}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{selectedSession?.error || "None"}</dd>
              </div>
              </dl>
            </>
          )}
        </section>
      </aside>}

      {selectedConversation && activeSidePanelTab && (
        <aside ref={sidePanelRef} className="subagent-side-panel" aria-label="Side panel">
          <div
            className="side-panel-resize-handle"
            role="separator"
            aria-label="Resize side panel"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={handleSidePanelResizePointerDown}
            onPointerMove={handleSidePanelResizePointerMove}
            onPointerUp={finishSidePanelResize}
            onPointerCancel={finishSidePanelResize}
            onLostPointerCapture={() => setIsSidePanelResizing(false)}
            onKeyDown={handleSidePanelResizeKeyDown}
          />
          <div className="subagent-panel-tabbar">
            {sidePanelTabs.tabs.map((tab) => {
              const run = tab.kind === "subagent" ? subagentRuns.find((candidate) => candidate.id === tab.runId) : undefined;
              const label = tab.kind === "subagents" ? "Subagents" : tab.kind === "file" ? fileNameForPath(tab.path) : run?.name ?? "Subagent";
              return (
                <div key={tab.id} className={`subagent-panel-tab ${sidePanelTabs.activeTabId === tab.id ? "active" : ""}`}>
                  <button type="button" className="subagent-panel-tab-select" onClick={() => setSidePanelTabs((state) => openSidePanelTab(state, tab))}>
                    {tab.kind === "file" ? <FileText size={14} strokeWidth={1.8} /> : run ? <SubagentAvatar run={run} compact /> : <Circle size={14} strokeWidth={2} fill="currentColor" />}
                    <span>{label}</span>
                  </button>
                  <button type="button" className="subagent-panel-tab-close" aria-label={`Close ${label}`} onClick={() => void closePanelTab(tab.id)}>
                    <X size={14} strokeWidth={1.9} />
                  </button>
                </div>
              );
            })}
          </div>
          {activeSidePanelTab.kind === "subagents" ? (
            <SubagentOverview runs={subagentRuns} onSelect={(id) => setSidePanelTabs((state) => openSidePanelTab(state, subagentSidePanelTab(id)))} />
          ) : activeSidePanelTab.kind === "subagent" ? (
            <SubagentTranscript
              run={subagentRuns.find((candidate) => candidate.id === activeSidePanelTab.runId)}
              workspaceRoot={selectedSession?.working_directory}
              onBack={() => setSidePanelTabs((state) => openSidePanelTab(state, { id: "subagents", kind: "subagents" }))}
            />
          ) : openFiles[activeSidePanelTab.path] ? (
            <Suspense fallback={<div className="subagent-panel-empty">Loading editor…</div>}>
              <FileEditorTab
                file={openFiles[activeSidePanelTab.path].file}
                draft={openFiles[activeSidePanelTab.path].draft}
                mode={openFiles[activeSidePanelTab.path].mode}
                saveStatus={openFiles[activeSidePanelTab.path].saveStatus}
                saveError={openFiles[activeSidePanelTab.path].saveError}
                workspaceRoot={selectedSession?.working_directory}
                line={activeSidePanelTab.line}
                column={activeSidePanelTab.column}
                onDraftChange={(draft) => updateFileDraft(activeSidePanelTab.path, draft)}
                onModeChange={(mode) => updateFileMode(activeSidePanelTab.path, mode)}
                onSave={() => void saveOpenFile(activeSidePanelTab.path)}
              />
            </Suspense>
          ) : (
            <div className="subagent-panel-empty">File is unavailable.</div>
          )}
        </aside>
      )}

      {createProjectOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateProjectDialog();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeCreateProjectDialog();
            }
          }}
        >
          <form className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title" onSubmit={(event) => void createNamedProject(event)}>
            <header>
              <h2 id="create-project-title">Create project</h2>
              <button type="button" className="dialog-close" onClick={closeCreateProjectDialog} disabled={isBusy} aria-label="Close">
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>

            <label className="project-name-field">
              <span className="sr-only">Project name</span>
              <Folder size={15} strokeWidth={1.8} />
              <input
                autoFocus
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="Project name"
                disabled={isBusy}
              />
            </label>

            <div className="project-folder-field">
              <span>Files and repositories <small>(optional)</small></span>
              {newProjectSources.length > 0 && (
                <div className="project-source-list">
                  {newProjectSources.map((draft) => (
                    <div className="project-source-row source-choice-row" key={draft.candidate.selectedPath}>
                      {draft.candidate.kind === "git" ? <GitBranch size={15} /> : <Folder size={15} />}
                      <span><strong>{draft.candidate.name}</strong><small>{draft.candidate.canonicalPath}</small></span>
                      {draft.candidate.kind === "git"
                        ? <div className="source-mode-actions"><em>Git repository</em></div>
                        : <div className="source-mode-actions"><em>{folderModeLabel(draft.folderMode)}</em>{draft.folderMode === "direct" ? <><button type="button" onClick={() => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === draft.candidate.selectedPath ? { ...item, folderMode: "copy" } : item))}>Use a copy</button><button type="button" onClick={() => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === draft.candidate.selectedPath ? { ...item, folderMode: "reference" } : item))}>Use as reference</button></> : <button type="button" onClick={() => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === draft.candidate.selectedPath ? { ...item, folderMode: "direct" } : item))}>Use directly</button>}</div>}
                      <button type="button" onClick={() => setNewProjectSources((current) => current.filter((item) => item.candidate.selectedPath !== draft.candidate.selectedPath))} aria-label={`Remove ${draft.candidate.name}`}><X size={14} /></button>
                      {draft.candidate.kind === "folder" && draft.folderMode === "direct" && <small className="source-direct-warning">Workspace changes will appear in the original folder.</small>}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="project-folder-picker compact" onClick={() => void chooseNewProjectSources()} disabled={isBusy}>
                <Plus size={16} strokeWidth={1.8} />
                <span>Add folder</span>
              </button>
              <small className="project-dialog-help">You can create an empty Project and add Sources later.</small>
            </div>

            {message && <p className="dialog-error">{message}</p>}

            <footer>
              <button type="button" className="dialog-cancel" onClick={closeCreateProjectDialog} disabled={isBusy}>Cancel</button>
              <button type="submit" className="dialog-submit" disabled={isBusy || !newProjectName.trim()}>Create project</button>
            </footer>
          </form>
        </div>
      )}

      {removeSourceTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) setRemoveSourceTarget(null); }} onKeyDown={(event) => { if (event.key === "Escape" && !isBusy) setRemoveSourceTarget(null); }}>
          <div className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-source-title">
            <header><div><h2 id="remove-source-title">Remove Source from Project?</h2><p>{removeSourceTarget.name}</p></div><button type="button" className="dialog-close" disabled={isBusy} onClick={() => setRemoveSourceTarget(null)} aria-label="Close"><X size={15} /></button></header>
            <p className="archive-workspace-copy">This only removes the Source from this Project’s list and from the choices for new Workspaces. Existing Workspaces, their Source bindings, files, worktrees, and all Git branches are kept. The original Source folder is not deleted.</p>
            {message && <p className="dialog-error">{message}</p>}
            <footer><button autoFocus type="button" className="dialog-cancel" disabled={isBusy} onClick={() => setRemoveSourceTarget(null)}>Cancel</button><button type="button" className="dialog-submit" disabled={isBusy} onClick={() => void confirmRemoveSource()}>{isBusy ? "Removing…" : "Remove from Project"}</button></footer>
          </div>
        </div>
      )}

      {addSourcesProjectId && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) setAddSourcesProjectId(null); }}>
          <div className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="add-sources-title">
            <header><div><h2 id="add-sources-title">Add Sources</h2><p>Review each Source before adding it.</p></div><button type="button" className="dialog-close" disabled={isBusy} onClick={() => setAddSourcesProjectId(null)}><X size={15} /></button></header>
            <div className="project-source-list">{newProjectSources.map((draft) => <div className="project-source-row source-choice-row" key={draft.candidate.selectedPath}>
              {draft.candidate.kind === "git" ? <GitBranch size={15} /> : <Folder size={15} />}
              <span><strong>{draft.candidate.name}</strong><small>{draft.candidate.canonicalPath}</small></span>
              {draft.candidate.kind === "git"
                ? <div className="source-mode-actions"><em>Git repository</em></div>
                : <div className="source-mode-actions"><em>{folderModeLabel(draft.folderMode)}</em>{draft.folderMode === "direct" ? <><button type="button" onClick={() => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === draft.candidate.selectedPath ? { ...item, folderMode: "copy" } : item))}>Use a copy</button><button type="button" onClick={() => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === draft.candidate.selectedPath ? { ...item, folderMode: "reference" } : item))}>Use as reference</button></> : <button type="button" onClick={() => setNewProjectSources((current) => current.map((item) => item.candidate.selectedPath === draft.candidate.selectedPath ? { ...item, folderMode: "direct" } : item))}>Use directly</button>}</div>}
              {draft.candidate.kind === "folder" && draft.folderMode === "direct" && <small className="source-direct-warning">Workspace changes will appear in the original folder.</small>}
            </div>)}</div>
            {message && <p className="dialog-error">{message}</p>}
            <footer><button type="button" className="dialog-cancel" disabled={isBusy} onClick={() => setAddSourcesProjectId(null)}>Cancel</button><button type="button" className="dialog-submit" disabled={isBusy} onClick={() => void confirmAddSources()}>Add Sources</button></footer>
          </div>
        </div>
      )}

      {createWorkspaceProject && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateWorkspaceDialog();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeCreateWorkspaceDialog();
            }
          }}
        >
          <form
            className="create-project-dialog create-workspace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
            onSubmit={(event) => void submitCreateWorkspace(event)}
          >
            <header>
              <div>
                <h2 id="create-workspace-title">Create workspace</h2>
                <p>{createWorkspaceProject.name}</p>
              </div>
              <button type="button" className="dialog-close" onClick={closeCreateWorkspaceDialog} disabled={isBusy} aria-label="Close">
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>

            <label className="workspace-dialog-field">
              <span>What are you working on?</span>
              <input
                autoFocus
                value={newWorkspaceTitle}
                onChange={(event) => updateNewWorkspaceTitle(event.target.value)}
                placeholder="Fix streaming tool results"
                disabled={isBusy}
              />
            </label>

            {workspaceRepositories.some((draft) => draft.selected) && (
              <label className="workspace-dialog-field">
                <span>Git branch <small>(optional)</small></span>
                <input
                  value={newWorkspaceBranchName}
                  onChange={(event) => setNewWorkspaceBranchName(event.target.value)}
                  placeholder="zotigo/<workspace-slug>-<short-id>"
                  disabled={isBusy}
                />
                <small>Leave blank to derive a stable branch from the Workspace name. Later renames will not change it.</small>
              </label>
            )}

            <div className="workspace-sources-field">
              <span>Sources <small>(optional)</small></span>
              {(workspaceRepositories.length > 0 || desktopState.folders.some((folder) => folder.project_id === createWorkspaceProject.id)) && (
                <small className="workspace-sources-help">Available Sources are selected by default. Uncheck anything this Workspace does not need.</small>
              )}
              {workspaceRepositories.map((draft) => (
                <div className={`workspace-source-card ${draft.selected ? "selected" : ""}`} key={draft.repository.id}>
                  <label className="workspace-source-toggle">
                    <input type="checkbox" checked={draft.selected} disabled={draft.repository.availability !== "available"} onChange={(event) => {
                      const selected = event.target.checked;
                      setWorkspaceRepositories((current) => current.map((candidate) => candidate.repository.id === draft.repository.id ? { ...candidate, selected } : candidate));
                    }} />
                    <GitBranch size={15} />
                    <strong>{draft.repository.name}</strong>
                  </label>
                  {draft.repository.availability !== "available" && <p className="workspace-dialog-note">Unavailable — reconnect or repair this Source before using it.</p>}
                  {draft.selected && (
                    <details className="workspace-source-settings">
                      <summary>
                        <span>Git settings</span>
                        <small>{draft.baseRef} → {newWorkspaceBranchName.trim() || "zotigo/<workspace-slug>-<short-id>"}</small>
                      </summary>
                      <div className="workspace-dialog-grid single-column">
                        <label className="workspace-dialog-field">
                          <span>Start from</span>
                          <input value={draft.baseRef} onChange={(event) => updateRepositoryBaseRef(draft.repository.id, event.target.value)} />
                          <small>Resolved by zotigod when the Workspace is created</small>
                        </label>
                      </div>
                    </details>
                  )}
                </div>
              ))}
              {desktopState.folders.filter((folder) => folder.project_id === createWorkspaceProject.id).map((folder) => (
                <div className={`workspace-source-card ${workspaceFolderModes[folder.id] ? "selected" : ""}`} key={folder.id}>
                  <label className="workspace-source-toggle"><input type="checkbox" checked={Boolean(workspaceFolderModes[folder.id])} disabled={folder.availability !== "available"} onChange={(event) => setWorkspaceFolderModes((current) => ({ ...current, [folder.id]: event.target.checked ? folder.default_mode : "" }))} /><Folder size={15} /><strong>{folder.name}</strong></label>
                  {folder.availability !== "available" && <p className="workspace-dialog-note">Unavailable — reconnect or repair this Source before using it.</p>}
                  {workspaceFolderModes[folder.id] === "direct" && <p className="workspace-direct-warning"><ShieldAlert size={14} /> Direct — changes appear immediately in the original folder.</p>}
                  {workspaceFolderModes[folder.id] === "copy" && <p className="workspace-dialog-note">Independent copy — changes stay inside this Workspace.</p>}
                  {workspaceFolderModes[folder.id] === "reference" && <p className="workspace-dialog-note">Reference snapshot — a read-only copy is placed under notes.</p>}
                </div>
              ))}
              {workspaceRepositories.length === 0 && desktopState.folders.every((folder) => folder.project_id !== createWorkspaceProject.id) && (
                <p className="workspace-dialog-note">This will be an empty Workspace with code, artifacts, and notes folders.</p>
              )}
            </div>
            {message && <p className="dialog-error">{message}</p>}

            <footer>
              <button type="button" className="dialog-cancel" onClick={closeCreateWorkspaceDialog} disabled={isBusy}>Cancel</button>
              <button
                type="submit"
                className="dialog-submit"
                disabled={
                  isBusy || !newWorkspaceTitle.trim() || workspaceRepositories.some((draft) => draft.selected && !draft.baseRef.trim())
                }
              >
                {isBusy ? "Creating…" : "Create workspace"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {workspaceSourcesTarget && (() => {
        const boundIds = new Set(workspaceSources.map((binding) => binding.source.id));
        const availableRepositories = desktopState.repositories.filter((source) => source.project_id === workspaceSourcesTarget.project_id && !boundIds.has(source.id));
        const availableFolders = desktopState.folders.filter((source) => source.project_id === workspaceSourcesTarget.project_id && !boundIds.has(source.id));
        const selectedRepository = availableRepositories.find((source) => source.id === workspaceSourceId);
        const selectedFolder = availableFolders.find((source) => source.id === workspaceSourceId);
        return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) closeWorkspaceSources(); }}>
          <div className="create-project-dialog workspace-sources-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-sources-title">
            <header><div><h2 id="workspace-sources-title">Workspace Sources</h2><p>{workspaceSourcesTarget.title}</p></div><button type="button" className="dialog-close" disabled={isBusy} onClick={closeWorkspaceSources} aria-label="Close"><X size={15} /></button></header>
            <section className="workspace-binding-list">
              <span>Dependencies</span>
              {workspaceSourcesLoading && <p className="workspace-dialog-note">Loading Workspace Sources…</p>}
              {!workspaceSourcesLoading && workspaceSourcesLoadError && <div className="workspace-source-load-error"><p>{workspaceSourcesLoadError}</p><button type="button" onClick={() => void loadWorkspaceSources(workspaceSourcesTarget.id)}>Reload</button></div>}
              {!workspaceSourcesLoading && workspaceSources.map((binding) => <div className="workspace-binding-row" key={binding.source.id}>
                {binding.source.kind === "git" ? <GitBranch size={15} /> : <Folder size={15} />}
                <span><strong>{workspaceSourceName(binding)}</strong><small>{binding.source.kind === "git" ? `${binding.base_ref} → ${binding.branch_name}` : `${binding.mode} → ${binding.target_path}`}</small>{binding.error && <small className="error">{binding.error}</small>}</span>
                <div className="workspace-binding-status"><em className={binding.status === "error" ? "error" : ""}>{binding.status}</em>{binding.status === "error" && <button type="button" disabled={isBusy} onClick={() => void retryWorkspaceSourceBindings()}><RefreshCw size={12} /> Retry</button>}</div>
              </div>)}
              {!workspaceSourcesLoading && !workspaceSourcesLoadError && workspaceSources.length === 0 && <p className="workspace-dialog-note">This Workspace has no Sources yet.</p>}
            </section>
            {!workspaceSourcesLoadError && workspaceSourcesTarget.status === "ready" && <section className="workspace-add-source">
              <span>Add dependency</span>
              {!workspaceSourcesLoading && (availableRepositories.length > 0 || availableFolders.length > 0) ? <>
                <label className="workspace-dialog-field">
                  <span>Project Source</span>
                  <select value={workspaceSourceId} onChange={(event) => selectWorkspaceSource(event.target.value)}>
                    <option value="">Choose a Source</option>
                    {availableRepositories.map((source) => <option value={source.id} key={source.id}>{source.name} — Git</option>)}
                    {availableFolders.map((source) => <option value={source.id} key={source.id}>{source.name} — Folder</option>)}
                  </select>
                </label>
                {selectedRepository && <div className="workspace-dialog-grid">
                  <label className="workspace-dialog-field"><span>Start from</span><input value={workspaceSourceBaseRef} onChange={(event) => setWorkspaceSourceBaseRef(event.target.value)} /></label>
                  <label className="workspace-dialog-field"><span>Branch <small>(optional)</small></span><input value={workspaceSourceBranchName} onChange={(event) => setWorkspaceSourceBranchName(event.target.value)} placeholder="zotigo/<workspace-slug>-<short-id>" /></label>
                </div>}
                {selectedFolder && <label className="workspace-dialog-field"><span>Folder mode</span><select value={workspaceSourceMode} onChange={(event) => setWorkspaceSourceMode(event.target.value as FolderSourceMode)}><option value="direct">Direct</option><option value="copy">Copy</option><option value="reference">Reference</option></select></label>}
              </> : !workspaceSourcesLoading && <p className="workspace-dialog-note">Every Source in this Project is already bound.</p>}
              <button type="button" className="workspace-add-project-source" onClick={() => { const projectId = workspaceSourcesTarget.project_id; closeWorkspaceSources(); void addSourcesToProject(projectId); }} disabled={isBusy}><FolderPlus size={14} /> Source not listed? Add it to the Project first</button>
            </section>}
            {!workspaceSourcesLoadError && workspaceSourcesTarget.status !== "ready" && <div className="workspace-source-unavailable"><p>This Workspace is {workspaceSourcesTarget.status}. Sources can only be added when it is ready.</p>{workspaceSourcesTarget.status === "error" && <button type="button" disabled={isBusy} onClick={() => void retryWorkspaceSourceBindings()}><RefreshCw size={12} /> Retry Workspace</button>}</div>}
            {message && <p className="dialog-error">{message}</p>}
            <footer><button type="button" className="dialog-cancel" disabled={isBusy} onClick={closeWorkspaceSources}>Close</button><button type="button" className="dialog-submit" disabled={isBusy || workspaceSourcesTarget.status !== "ready" || workspaceSourcesLoading || Boolean(workspaceSourcesLoadError) || !workspaceSourceId || Boolean(selectedRepository && !workspaceSourceBaseRef.trim())} onClick={() => void confirmAddWorkspaceSource()}>Add Source</button></footer>
          </div>
        </div>;
      })()}

      {archiveWorkspaceTarget && workspaceArchivePreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeArchiveWorkspaceDialog(); }}>
          <div className="create-project-dialog archive-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-workspace-title">
            <header>
              <div>
                <h2 id="archive-workspace-title">Archive workspace?</h2>
                <p>{archiveWorkspaceTarget.title}</p>
              </div>
              <button type="button" className="dialog-close" onClick={closeArchiveWorkspaceDialog} disabled={isBusy} aria-label="Close"><X size={15} /></button>
            </header>
            <p className="archive-workspace-copy">Sessions, Git branches, artifacts, and notes are kept. Zotigo will remove linked Git worktrees and hide this Workspace.</p>
            <div className="archive-workspace-path-row">
              <code className="archive-workspace-path">{workspaceArchivePreview.root_path}</code>
              <button type="button" className="copy-path-button" title="Copy path" aria-label="Copy Workspace path" onClick={() => void copyWorkspacePath(workspaceArchivePreview.root_path)}>
                {copiedWorkspacePath === workspaceArchivePreview.root_path ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
              </button>
              {kind === "desktop" && <button type="button" onClick={() => void client.revealPath(workspaceArchivePreview.root_path).catch((error) => setWorkspaceLifecycleError(errorMessage(error)))}><FolderOpen size={14} strokeWidth={1.8} /><span>Open in Finder</span></button>}
            </div>
            {workspaceArchivePreview.worktree_paths.length > 0 && (
              <section className="archive-workspace-summary">
                <strong>{workspaceArchivePreview.worktree_paths.length} linked {workspaceArchivePreview.worktree_paths.length === 1 ? "worktree" : "worktrees"} will be removed</strong>
                {workspaceArchivePreview.worktree_paths.map((worktreePath) => <small key={worktreePath}>{worktreePath}</small>)}
              </section>
            )}
            {workspaceArchivePreview.dirty_worktree_paths.length > 0 && (
              <section className="archive-workspace-warning"><ShieldAlert size={16} /><span><strong>Uncommitted changes found</strong><small>Commit or discard changes in these worktrees before archiving.</small>{workspaceArchivePreview.dirty_worktree_paths.map((worktreePath) => <code key={worktreePath}>{worktreePath}</code>)}</span></section>
            )}
            {workspaceLifecycleError && <p className="dialog-error">{workspaceLifecycleError}</p>}
            <footer>
              <button type="button" className="dialog-cancel" onClick={closeArchiveWorkspaceDialog} disabled={isBusy}>Cancel</button>
              <button type="button" className="dialog-submit destructive" onClick={() => void confirmArchiveWorkspace()} disabled={isBusy || workspaceArchivePreview.dirty_worktree_paths.length > 0}>{isBusy ? "Archiving…" : "Archive workspace"}</button>
            </footer>
          </div>
        </div>
      )}

      {deleteWorkspaceTarget && workspaceDeletePreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeleteWorkspaceDialog(); }}>
          <div className="create-project-dialog archive-workspace-dialog delete-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-workspace-title">
            <header>
              <div>
                <h2 id="delete-workspace-title">Delete workspace?</h2>
                <p>{deleteWorkspaceTarget.title}</p>
              </div>
              <button type="button" className="dialog-close" onClick={closeDeleteWorkspaceDialog} disabled={isBusy} aria-label="Close"><X size={15} /></button>
            </header>
            <p className="archive-workspace-copy">Workspace files, copied folders, and linked worktrees will be permanently deleted by zotigod. Original Sources, runtime session history, and all local and remote Git branches are kept.</p>
            <div className="archive-workspace-path-row">
              <code className="archive-workspace-path">{workspaceDeletePreview.root_path}</code>
              <button type="button" className="copy-path-button" title="Copy path" aria-label="Copy Workspace path" onClick={() => void copyWorkspacePath(workspaceDeletePreview.root_path)}>
                {copiedWorkspacePath === workspaceDeletePreview.root_path ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
              </button>
              {kind === "desktop" && <button type="button" onClick={() => void client.revealPath(workspaceDeletePreview.root_path).catch((error) => setWorkspaceLifecycleError(errorMessage(error)))}><FolderOpen size={14} strokeWidth={1.8} /><span>Open in Finder</span></button>}
            </div>
            <section className="archive-workspace-warning delete-workspace-warning">
              <ShieldAlert size={16} />
              <span>
                <strong>This cannot be undone</strong>
                <small>All managed Workspace files will be removed. Session history remains available in zotigod.</small>
                {workspaceDeletePreview.dirty_worktree_paths.length > 0 && <small>Uncommitted changes in {workspaceDeletePreview.dirty_worktree_paths.length} linked {workspaceDeletePreview.dirty_worktree_paths.length === 1 ? "worktree" : "worktrees"} will also be discarded.</small>}
              </span>
            </section>
            <label className="delete-workspace-confirmation">
              <span>Type <strong>{deleteWorkspaceTarget.title}</strong> to confirm</span>
              <input autoFocus value={deleteWorkspaceConfirmation} onChange={(event) => setDeleteWorkspaceConfirmation(event.target.value)} disabled={isBusy} />
            </label>
            {workspaceLifecycleError && <p className="dialog-error">{workspaceLifecycleError}</p>}
            <footer>
              <button type="button" className="dialog-cancel" onClick={closeDeleteWorkspaceDialog} disabled={isBusy}>Cancel</button>
              <button type="button" className="dialog-submit destructive" onClick={() => void confirmDeleteWorkspace()} disabled={isBusy || deleteWorkspaceConfirmation !== deleteWorkspaceTarget.title}>{isBusy ? "Deleting…" : "Delete workspace"}</button>
            </footer>
          </div>
        </div>
      )}

      {renameDialogConversation && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRenameConversationDialog();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeRenameConversationDialog();
            }
          }}
        >
          <form
            className="rename-conversation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-conversation-title"
            onSubmit={(event) => void submitRenameConversationDialog(event)}
          >
            <header>
              <div>
                <h2 id="rename-conversation-title">Rename chat</h2>
                <p>Keep it short and easy to recognize</p>
              </div>
              <button
                type="button"
                className="dialog-close"
                onClick={closeRenameConversationDialog}
                disabled={isSavingConversationTitle}
                aria-label="Close"
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>

            <label>
              <span className="sr-only">Conversation title</span>
              <input
                autoFocus
                value={renameDialogTitleDraft}
                onChange={(event) => setRenameDialogTitleDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                disabled={isSavingConversationTitle}
              />
            </label>

            <footer>
              <button
                type="button"
                className="dialog-cancel"
                onClick={closeRenameConversationDialog}
                disabled={isSavingConversationTitle}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dialog-submit"
                disabled={isSavingConversationTitle || !renameDialogTitleDraft.trim()}
              >
                Save
              </button>
            </footer>
          </form>
        </div>
      )}

      {renameDialogProject && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRenameProjectDialog();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeRenameProjectDialog();
          }}
        >
          <form
            className="rename-conversation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-project-title"
            onSubmit={(event) => void submitRenameProjectDialog(event)}
          >
            <header>
              <div>
                <h2 id="rename-project-title">Rename project</h2>
                <p>This changes the display name only</p>
              </div>
              <button type="button" className="dialog-close" onClick={closeRenameProjectDialog} disabled={isSavingProjectName} aria-label="Close">
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>
            <label>
              <span className="sr-only">Project name</span>
              <input
                autoFocus
                value={renameDialogProjectNameDraft}
                onChange={(event) => setRenameDialogProjectNameDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                disabled={isSavingProjectName}
              />
            </label>
            {message && <p className="dialog-error">{message}</p>}
            <footer>
              <button type="button" className="dialog-cancel" onClick={closeRenameProjectDialog} disabled={isSavingProjectName}>Cancel</button>
              <button type="submit" className="dialog-submit" disabled={isSavingProjectName || !renameDialogProjectNameDraft.trim()}>
                {isSavingProjectName ? "Saving…" : "Save"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {renameDialogWorkspace && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRenameWorkspaceDialog();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeRenameWorkspaceDialog();
          }}
        >
          <form
            className="rename-conversation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-workspace-title"
            onSubmit={(event) => void submitRenameWorkspaceDialog(event)}
          >
            <header>
              <div>
                <h2 id="rename-workspace-title">Rename workspace</h2>
                <p>This changes the display name only</p>
              </div>
              <button type="button" className="dialog-close" onClick={closeRenameWorkspaceDialog} disabled={isSavingWorkspaceTitle} aria-label="Close">
                <X size={15} strokeWidth={1.8} />
              </button>
            </header>
            <label>
              <span className="sr-only">Workspace name</span>
              <input
                autoFocus
                value={renameDialogWorkspaceTitleDraft}
                onChange={(event) => setRenameDialogWorkspaceTitleDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                disabled={isSavingWorkspaceTitle}
              />
            </label>
            {message && <p className="dialog-error">{message}</p>}
            <footer>
              <button type="button" className="dialog-cancel" onClick={closeRenameWorkspaceDialog} disabled={isSavingWorkspaceTitle}>Cancel</button>
              <button type="submit" className="dialog-submit" disabled={isSavingWorkspaceTitle || !renameDialogWorkspaceTitleDraft.trim()}>
                {isSavingWorkspaceTitle ? "Saving…" : "Save"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}

function ContextUsageBadge({ usage }: { usage: { tokens: number; window: number } }) {
  const ratio = usage.window > 0 ? Math.min(1, usage.tokens / usage.window) : 0;
  const percent = Math.round(ratio * 100);
  return (
    <span
      className="context-usage-badge"
      tabIndex={0}
      aria-label={`Context window ${percent}% used`}
    >
      <span className="context-usage-ring" style={{ "--context-used": `${ratio * 360}deg` } as React.CSSProperties} />
      {percent}%
      <span className="context-usage-tooltip" role="tooltip">
        <span>Context window:</span>
        <strong>{percent}% used</strong>
        <small>{formatCompactTokenCount(usage.tokens)} tokens used, {formatCompactTokenCount(usage.window)} total</small>
      </span>
    </span>
  );
}

function firstUserPrompt(items: DisplayItem[]): string | null {
  const item = items.find((candidate) => candidate.type === "user_message");
  const text = item?.content?.filter((part) => part.type === "text").map((part) => part.text?.trim() ?? "").filter(Boolean).join("\n");
  return text || null;
}

function ConversationNavItem({
  conversation,
  selected,
  working,
  onSelect,
  onRename,
  onPin,
  onArchive,
  sort,
}: {
  conversation: DesktopConversation;
  selected: boolean;
  working: boolean;
  onSelect: () => void;
  onRename: () => void;
  onPin: () => void;
  onArchive: () => void;
  sort?: SidebarSortProps;
}) {
  const titleViewportRef = useRef<HTMLSpanElement | null>(null);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);

  function startTitleScroll() {
    requestAnimationFrame(() => {
      const viewport = titleViewportRef.current;
      const text = titleTextRef.current;
      if (!viewport || !text) return;
      if (!viewport.closest(".sidebar-session")?.matches(":hover")) return;
      const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
      text.style.setProperty("--sidebar-title-distance", `${distance}px`);
      text.style.setProperty("--sidebar-title-duration", `${Math.max(3, Math.min(9, distance / 24 + 2))}s`);
      text.classList.toggle("scrolling", distance > 0);
    });
  }

  function stopTitleScroll() {
    titleTextRef.current?.classList.remove("scrolling");
  }

  return (
    <div
      className={`sidebar-session ${selected ? "selected" : ""} ${sort?.dragging ? "dragging" : ""} ${sort?.dropPosition ? `drop-${sort.dropPosition}` : ""}`}
      onMouseEnter={startTitleScroll}
      onMouseLeave={stopTitleScroll}
      draggable={sort?.draggable}
      onDragStart={sort?.onDragStart}
      onDragOver={sort?.onDragOver}
      onDrop={sort?.onDrop}
      onDragEnd={sort?.onDragEnd}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onRename}
        title={conversation.title}
      >
        <span className="sidebar-session-title" ref={titleViewportRef}>
          <span ref={titleTextRef}>{conversation.title}</span>
        </span>
      </button>
      {working && <LoaderCircle className="sidebar-session-spinner" size={13} strokeWidth={1.9} aria-label="Running" />}
      <div className="sidebar-session-actions">
        <button type="button" onClick={onPin} title={conversation.pinned_at ? "Unpin" : "Pin"} aria-label={`${conversation.pinned_at ? "Unpin" : "Pin"} ${conversation.title}`}>
          <Pin size={12} strokeWidth={1.8} fill={conversation.pinned_at ? "currentColor" : "none"} />
        </button>
        <button type="button" onClick={onArchive} title="Archive" aria-label={`Archive ${conversation.title}`}>
          <Archive size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function ProjectOverview({
  project, state, message, onAddSources, onRename, onRemoveSource,
  onCreateWorkspace, onManageWorkspaceSources, onOpenPath,
}: {
  project: DesktopProject;
  state: DesktopState;
  message: string | null;
  onAddSources: () => void;
  onRename: () => void;
  onRemoveSource: (kind: "git" | "folder", sourceId: string, name: string) => void;
  onCreateWorkspace: () => void;
  onManageWorkspaceSources: (workspace: DesktopWorkspace) => void;
  onOpenPath?: (path: string) => void;
}) {
  const repositories = state.repositories.filter((source) => source.project_id === project.id);
  const folders = state.folders.filter((source) => source.project_id === project.id);
  const workspaces = state.workspaces.filter((workspace) => workspace.project_id === project.id);
  return <div className="project-overview">
    <header>
      <div><FolderOpen size={22} /><span><button type="button" className="project-overview-title" onClick={onRename} title="Rename project"><h2>{project.name}</h2><SquarePen size={14} /></button><p>Sources and Workspaces managed by zotigod</p></span></div>
      <button type="button" className="dialog-submit" onClick={onCreateWorkspace}><Plus size={14} /> New workspace</button>
    </header>
    {message && <p className="dialog-error">{message}</p>}
    <section className="project-overview-card">
      <div className="project-overview-heading"><h3>Sources</h3><button type="button" onClick={onAddSources}><Plus size={13} /> Add source</button></div>
      {repositories.map((source) => <div className="project-source-row" key={source.id}>
        <GitBranch size={15} /><button type="button" className="source-path-button" disabled={!onOpenPath} title={onOpenPath ? "Open in Finder" : "Server folder"} onClick={() => onOpenPath?.(source.source_path)}><strong>{source.name}</strong><small>{source.source_path}</small></button>
        <button type="button" onClick={() => onRemoveSource("git", source.id, source.name)} aria-label={`Remove ${source.name} from Project`}><X size={13} /></button>
      </div>)}
      {folders.map((source) => <div className="project-source-row" key={source.id}>
          <Folder size={15} /><button type="button" className="source-path-button" disabled={!onOpenPath} title={onOpenPath ? "Open in Finder" : "Server folder"} onClick={() => onOpenPath?.(source.source_path)}><strong>{source.name}</strong><small>{source.source_path}</small></button>
          <div className="source-row-actions"><em>{folderModeLabel(source.default_mode)}</em></div><button type="button" onClick={() => onRemoveSource("folder", source.id, source.name)} aria-label={`Remove ${source.name} from Project`}><X size={13} /></button>
        </div>)}
      {repositories.length === 0 && folders.length === 0 && <p className="project-overview-empty">No Sources. Empty Workspaces are supported.</p>}
    </section>
    <section className="project-overview-card">
      <div className="project-overview-heading"><h3>Workspaces</h3></div>
      {workspaces.map((workspace) => <div className="workspace-overview-row" key={workspace.id}>
        <GitBranch size={15} /><span><strong>{workspace.title}</strong><small>{workspace.root_path}</small></span>
        <><button type="button" onClick={() => onManageWorkspaceSources(workspace)}>Sources</button>{onOpenPath && <><button type="button" onClick={() => onOpenPath(pathJoinForUi(workspace.root_path, "artifacts"))}>Artifacts</button><button type="button" onClick={() => onOpenPath(pathJoinForUi(workspace.root_path, "notes"))}>Notes</button></>}</>
      </div>)}
      {workspaces.length === 0 && <p className="project-overview-empty">No Workspaces yet.</p>}
    </section>
  </div>;
}

function workspaceSourceName(binding: CatalogWorkspaceSource): string {
  const parts = binding.source.canonical_path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? binding.source.source_key;
}

function pathJoinForUi(root: string, child: string): string {
  return `${root.replace(/\/$/, "")}/${child}`;
}

function fileNameForPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function folderModeLabel(mode: FolderSourceMode): string {
  if (mode === "copy") return "Independent copy by default";
  if (mode === "reference") return "Reference by default";
  return "Direct by default";
}

function projectSourceInput(draft: ProjectSourceDraft): ProjectSourceInput {
  return {
    path: draft.candidate.selectedPath,
    ...(draft.candidate.kind === "folder" ? { folderMode: draft.folderMode } : {}),
  };
}

function StateBadge({ state }: { state: ZotigoSession["state"] | "idle" }) {
  return <span className={`state-badge ${state}`}>{state}</span>;
}

function StatusPill({ state }: { state: ConnectionState }) {
  return (
    <span className={`status-pill ${state}`}>
      <span />
      {connectionLabel(state)}
    </span>
  );
}

function connectionLabel(state: ConnectionState): string {
  if (state === "checking") {
    return "Checking";
  }
  return state === "online" ? "Online" : "Offline";
}

function projectForConversation(conversation: DesktopConversation, projects: DesktopProject[]): DesktopProject | null {
  if (!conversation.project_id) {
    return null;
  }
  return projects.find((project) => project.id === conversation.project_id) ?? null;
}

function sessionFromBinding(binding: DaemonSessionBinding): ZotigoSession {
  const state = binding.state ?? "created";
  return {
    id: binding.daemon_session_id,
    state,
    live: state !== "offline",
    working: false,
    created_at: binding.daemon_created_at ?? binding.created_at,
    started_at: binding.daemon_started_at,
    ended_at: binding.daemon_ended_at,
    error: binding.error,
  };
}

function clearResolvedApprovalPolicyOverrides(
  overrides: Record<string, ApprovalPolicy>,
  sessions: ZotigoSession[],
): Record<string, ApprovalPolicy> {
  let next = overrides;
  for (const session of sessions) {
    const override = next[session.id];
    const abandoned = session.state === "offline" || session.state === "ended" || session.state === "failed";
    if (!override || (session.approval_policy !== override && !abandoned)) {
      continue;
    }
    if (next === overrides) {
      next = { ...overrides };
    }
    delete next[session.id];
  }
  return next;
}

function upsertSession(sessions: ZotigoSession[], session: ZotigoSession): ZotigoSession[] {
  if (sessions.some((current) => current.id === session.id)) {
    return sessions.map((current) => (current.id === session.id ? session : current));
  }
  return [session, ...sessions];
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
