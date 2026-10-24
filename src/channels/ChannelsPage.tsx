import { stateLabel } from "../../shared/i18n/display";
import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import type { ModelFavoritesControl } from "../modelFavorites";
import { ArrowLeft, ArrowUpRight, Bot, CheckCircle2, CircleAlert, MessageSquare, PanelLeft, Plus, RefreshCw, Save, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { canConfigureChannelGroup, channelGroupName, type ChannelConnection, type ChannelConnectionInput, type ChannelConversation, type ChannelConversationInput, type ChannelGroup, type ChannelSender } from "../../shared/channels";
import type { DesktopConversation, DesktopProject, DesktopWorkspace } from "../../shared/clientTypes";
import type { AgentCatalogEntry, AgentModel, RuntimeProfile, ZotigoSession } from "../../shared/zotigod";
import { useClient } from "../ClientContext";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { ProjectDisclosureIcon } from "../SidebarDisclosureIcons";
import { compatibleReasoningEffort, RuntimeSettingsPicker } from "../conversation/ConversationComposer";

const defaultApprovalInstructions = "Only auto-approve actions necessary for the request that are reversible and confined to the bound workspace. Request owner approval for destructive changes, credential access, external publishing or messaging, permission changes, and ambiguity with material impact.";
const emptyConnection = (): ChannelConnectionInput => ({ provider: "feishu", name: t("channelsPage.feishu"), app_id: "", app_secret: "", enabled: false, allow_chat_ids: [], agent_instructions: "", approval_instructions: defaultApprovalInstructions, approval_policy: "auto", review_all_tools: true, progress_mode: "auto" });
const connectionInput = (connection: ChannelConnection): ChannelConnectionInput => ({ provider: "feishu", name: connection.name, app_id: connection.app_id, enabled: connection.enabled, allow_chat_ids: [], agent_instructions: connection.agent_instructions, approval_instructions: connection.approval_instructions, approval_policy: connection.approval_policy || "auto", review_all_tools: connection.review_all_tools, progress_mode: connection.progress_mode });
const conversationInput = (conversation: ChannelConversation): ChannelConversationInput => ({ display_name: channelGroupName([conversation], conversation.chat_id), session_strategy: conversation.session_strategy, session_id: conversation.session_id ?? "", workspace_id: conversation.workspace_id ?? "", enabled: conversation.enabled, sender_policy: conversation.sender_policy ?? "selected", allowed_sender_ids: conversation.allowed_sender_ids, agent: conversation.agent, profile_name: conversation.profile_name, model: conversation.model, reasoning_effort: conversation.reasoning_effort, agent_instructions_mode: conversation.agent_instructions_mode, agent_instructions: conversation.agent_instructions, approval_instructions_mode: conversation.approval_instructions_mode, approval_instructions: conversation.approval_instructions, approval_policy: conversation.approval_policy || "", review_all_tools: conversation.review_all_tools ?? undefined });

function assertRuntimeSaved(input: ChannelConversationInput, saved: ChannelConversation) {
  if (saved.session_strategy !== input.session_strategy) throw new Error(t("channelsPage.thisZotigodVersionDoesNotSupportSharedChannel"));
  if ((saved.sender_policy ?? "selected") !== input.sender_policy) throw new Error(t("channelsPage.thisZotigodVersionDoesNotSupportChannelSender"));
  if (saved.agent !== input.agent || saved.profile_name !== input.profile_name || saved.model !== input.model || saved.reasoning_effort !== input.reasoning_effort) {
    throw new Error(t("channelsPage.thisZotigodVersionDoesNotSupportChannelRuntime"));
  }
}

interface ChannelsPageProps {
  favorites: Omit<ModelFavoritesControl, "select">;
  hostName: string;
  projects: DesktopProject[];
  workspaces: DesktopWorkspace[];
  agents?: AgentCatalogEntry[];
  sessions?: ZotigoSession[];
  sessionCatalog?: DesktopConversation[];
  navigationRoot: HTMLElement;
  navigationButtonRef: RefObject<HTMLButtonElement | null>;
  navigationOpen: boolean;
  sessionVisible: boolean;
  selectedSessionId?: string | null;
  onOpenNavigation: () => void;
  onShowConfiguration: () => void;
  onBack: () => void;
  onOpenSession: (id: string, leaveChannels?: boolean) => Promise<void>;
}

export function ChannelsPage({ favorites, hostName, projects, workspaces, agents = [], sessions = [], sessionCatalog = [], navigationRoot, navigationButtonRef, navigationOpen, sessionVisible, selectedSessionId, onOpenNavigation, onShowConfiguration, onBack, onOpenSession }: ChannelsPageProps) {
  useLocale();
  const { api } = useClient();
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<ChannelConnectionInput>(emptyConnection);
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
  const [boundSessionIds, setBoundSessionIds] = useState<Set<string>>(() => new Set());
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupDraft, setGroupDraft] = useState<ChannelConversationInput | null>(null);
  const [groupProjectId, setGroupProjectId] = useState("");
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [defaultProfile, setDefaultProfile] = useState("");
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [showAvailableGroups, setShowAvailableGroups] = useState(false);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChannelConnection | null>(null);
  const [status, setStatus] = useState("");
  const [groupMembers, setGroupMembers] = useState<ChannelSender[]>([]);
  const [groupMembersError, setGroupMembersError] = useState("");
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);

  const selectedConnection = connections.find((value) => value.id === selectedConnectionId);
  const selectedGroup = groups.find((value) => value.chat_id === selectedGroupId);
  const groupConversation = conversations.find((value) => value.id === selectedGroup?.conversation_id && !value.root_id);
  const selectedConnectionConfig = selectedConnection ? JSON.stringify(connectionInput(selectedConnection)) : "";
  const groupConversationConfig = groupConversation ? JSON.stringify(groupConversation) : "";
  const ownerSenderIDs = selectedConnection?.owner_sender_ids ?? [];
  const startingConnectionIds = connections.filter((value) => value.status === "starting").map((value) => value.id).sort().join("\n");
  const readyWorkspaces = useMemo(() => workspaces.filter((value) => value.status === "ready"), [workspaces]);
  const visibleWorkspaces = useMemo(() => readyWorkspaces.filter((value) => value.project_id === groupProjectId), [readyWorkspaces, groupProjectId]);
  const workspaceById = useMemo(() => new Map(workspaces.map((value) => [value.id, value])), [workspaces]);
  const sessionTitleById = useMemo(() => new Map(sessionCatalog.map((value) => [value.id, value.title])), [sessionCatalog]);
  const selectedWorkspace = groupDraft?.workspace_id ? workspaceById.get(groupDraft.workspace_id) : undefined;
  const compatibleSessions = useMemo(() => sessions.filter((session) => selectedWorkspace
    && session.working_directory === selectedWorkspace.root_path
    && (session.id === groupConversation?.session_id || sessionTitleById.has(session.id))
    && (session.id === groupConversation?.session_id || (!session.working && (session.state === "created" || session.state === "offline" || session.state === "running")))
    && (session.id === groupConversation?.session_id || session.agent !== "codex" || session.channel_tools_eligible === true)
    && (!boundSessionIds.has(session.id) || session.id === groupConversation?.session_id)), [boundSessionIds, groupConversation?.session_id, sessionTitleById, sessions, selectedWorkspace]);
  const codexModels: AgentModel[] = agents.find((agent) => agent.id === "codex")?.models ?? [];
  const runtimeValid = groupDraft?.agent !== "codex" || Boolean(groupDraft.model && groupDraft.reasoning_effort);
  const selectableGroupMembers = useMemo(() => {
    const byID = new Map(groupMembers.map((member) => [member.id, member]));
    for (const id of groupDraft?.allowed_sender_ids ?? []) {
      if (!byID.has(id)) byID.set(id, { id });
    }
    return [...byID.values()];
  }, [groupMembers, groupDraft?.allowed_sender_ids]);
  const topicsByChat = useMemo(() => {
    const values = new Map<string, ChannelConversation[]>();
    for (const conversation of conversations) {
      if (conversation.chat_type !== "group" || !conversation.root_id) continue;
      values.set(conversation.chat_id, [...(values.get(conversation.chat_id) ?? []), conversation]);
    }
    for (const entries of values.values()) entries.sort((left, right) => Date.parse(right.last_activity_at) - Date.parse(left.last_activity_at));
    return values;
  }, [conversations]);

  async function loadConnectionData(connectionId: string) {
    if (!connectionId) return { groups: [] as ChannelGroup[], conversations: [] as ChannelConversation[], boundSessionIds: new Set<string>(), warning: "" };
    // Group discovery materializes each rootless configuration record. Read the
    // conversations afterwards so a newly discovered group is immediately editable.
    let nextGroups: ChannelGroup[] = [];
    let warning = "";
    try {
      nextGroups = await api.listChannelGroups(connectionId);
    } catch (error) {
      warning = error instanceof Error ? t("channelsPage.couldNotRefreshFeishuGroups", { p0: error.message }) : t("channelsPage.couldNotRefreshFeishuGroups2");
    }
    const allConversations = await api.listChannelConversations();
    const nextConversations = allConversations.filter((conversation) => conversation.connection_id === connectionId);
    const knownChatIDs = new Set(nextGroups.map((group) => group.chat_id));
    for (const conversation of nextConversations) {
      if (conversation.chat_type !== "group" || conversation.root_id || knownChatIDs.has(conversation.chat_id)) continue;
      nextGroups.push({ chat_id: conversation.chat_id, chat_mode: conversation.chat_mode, name: channelGroupName(nextConversations, conversation.chat_id), available: false, conversation_id: conversation.id, session_strategy: conversation.session_strategy, session_id: conversation.session_id, workspace_id: conversation.workspace_id, enabled: conversation.enabled, sender_policy: conversation.sender_policy ?? "selected", allowed_sender_ids: conversation.allowed_sender_ids, agent: conversation.agent, profile_name: conversation.profile_name, model: conversation.model, reasoning_effort: conversation.reasoning_effort });
    }
    return { groups: nextGroups, conversations: nextConversations, boundSessionIds: new Set(allConversations.flatMap((conversation) => conversation.session_id ? [conversation.session_id] : [])), warning };
  }
  async function load(preferredConnection?: string, showConnection = false) {
    const request = ++requestVersion.current;
    const nextConnections = await api.listChannelConnections();
    if (request !== requestVersion.current) return;
    const requested = preferredConnection ?? selectedConnectionId;
    const connectionId = nextConnections.some((value) => value.id === requested) ? requested : nextConnections[0]?.id ?? "";
    const data = await loadConnectionData(connectionId);
    if (request !== requestVersion.current) return;
    setConnections(nextConnections); setSelectedConnectionId(connectionId); if (showConnection) setCreatingConnection(false); setSelectedGroupId(""); setShowAvailableGroups(false); setCollapsedProjectIds(new Set()); setCollapsedGroupIds(new Set()); setGroups(data.groups); setConversations(data.conversations); setBoundSessionIds(data.boundSessionIds);
    setStatus(data.warning);
  }
  async function selectConnection(id: string) {
    const request = ++requestVersion.current;
    const data = await loadConnectionData(id);
    if (request !== requestVersion.current) return;
    setSelectedConnectionId(id); setCreatingConnection(false); setSelectedGroupId(""); setShowAvailableGroups(false); setCollapsedProjectIds(new Set()); setCollapsedGroupIds(new Set()); setGroups(data.groups); setConversations(data.conversations); setBoundSessionIds(data.boundSessionIds);
    setStatus(data.warning);
  }
  async function refreshGroups() {
    if (!selectedConnectionId) return;
    const request = ++requestVersion.current;
    const data = await loadConnectionData(selectedConnectionId);
    if (request !== requestVersion.current) return;
    setGroups(data.groups); setConversations(data.conversations); setBoundSessionIds(data.boundSessionIds);
    if (data.warning) setStatus(data.warning);
  }

  useEffect(() => {
    let active = true;
    void load().catch((error: Error) => { if (active) setStatus(error.message); });
    return () => { active = false; requestVersion.current++; };
  }, [api]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setProfiles([]);
    setDefaultProfile("");
    if (!selectedWorkspace) { setProfilesLoading(false); return () => { active = false; }; }
    setProfilesLoading(true);
    void Promise.resolve().then(() => api.getProfiles(selectedWorkspace.root_path)).then((response) => {
      if (!active) return;
      setProfiles(response.profiles);
      setDefaultProfile(response.default_profile);
    }).catch(() => { if (active) { setProfiles([]); setDefaultProfile(""); } }).finally(() => { if (active) setProfilesLoading(false); });
    return () => { active = false; };
  }, [api, selectedWorkspace?.id, selectedWorkspace?.root_path]);
  useEffect(() => {
    if (!startingConnectionIds) return;
    let active = true;
    let timer = 0;
    const refreshRuntime = async () => {
      try { const latest = await api.listChannelConnections(); if (active) setConnections(latest); } catch { /* keep the last runtime state */ }
      finally { if (active) timer = window.setTimeout(refreshRuntime, 1000); }
    };
    timer = window.setTimeout(refreshRuntime, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, startingConnectionIds]);
  useEffect(() => { if (!creatingConnection) setConnectionDraft(selectedConnection ? connectionInput(selectedConnection) : emptyConnection()); }, [creatingConnection, selectedConnectionId, selectedConnectionConfig]);
  useEffect(() => {
    if (!groupConversation || !selectedConnection) { setGroupDraft(null); setGroupProjectId(""); return; }
    const draft = conversationInput(groupConversation);
    setGroupDraft(draft);
    setGroupProjectId(draft.workspace_id ? workspaceById.get(draft.workspace_id)?.project_id ?? "" : "");
  }, [groupConversationConfig, selectedConnectionId, workspaceById]);
  useEffect(() => {
    let active = true;
    setGroupMembers([]);
    setGroupMembersError("");
    if (!selectedConnectionId || !selectedGroupId || groupDraft?.sender_policy !== "selected") return () => { active = false; };
    setGroupMembersLoading(true);
    void Promise.resolve().then(() => api.listChannelGroupMembers(selectedConnectionId, selectedGroupId)).then((members) => {
      if (active) setGroupMembers(members);
    }).catch((error: Error) => {
      if (active) setGroupMembersError(error.message);
    }).finally(() => { if (active) setGroupMembersLoading(false); });
    return () => { active = false; };
  }, [api, selectedConnectionId, selectedGroupId, groupDraft?.sender_policy]);

  const run = (operation: () => Promise<void>, onError?: () => void) => { setBusy(true); setStatus(""); void operation().catch((error: Error) => { if (mounted.current) { setStatus(error.message); onError?.(); } }).finally(() => { if (mounted.current) setBusy(false); }); };
  const chooseGroup = (group: ChannelGroup) => { setStatus(""); setCreatingConnection(false); setSelectedGroupId(group.chat_id); onShowConfiguration(); };
  const reconcileGroup = (saved: ChannelConversation) => {
    setConversations((values) => values.map((value) => value.id === saved.id ? saved : value));
    setBoundSessionIds((values) => {
      const next = new Set(values);
      if (groupConversation?.session_id) next.delete(groupConversation.session_id);
      if (saved.session_id) next.add(saved.session_id);
      return next;
    });
    setGroups((values) => values.map((value) => value.chat_id === saved.chat_id ? { ...value, session_strategy: saved.session_strategy, session_id: saved.session_id, workspace_id: saved.workspace_id, enabled: saved.enabled, sender_policy: saved.sender_policy, allowed_sender_ids: saved.allowed_sender_ids, agent: saved.agent, profile_name: saved.profile_name, model: saved.model, reasoning_effort: saved.reasoning_effort } : value));
    setGroupDraft(conversationInput(saved));
    setGroupProjectId(saved.workspace_id ? workspaceById.get(saved.workspace_id)?.project_id ?? "" : "");
  };
  const saveGroup = async () => {
    if (!selectedGroup || !groupConversation || !groupDraft) return;
    const input = { ...groupDraft, display_name: selectedGroup.name || selectedGroup.chat_id, session_id: groupDraft.session_strategy === "shared" ? groupDraft.session_id : "", enabled: true };
    const saved = await api.updateChannelConversation(groupConversation.id, input);
    try {
      assertRuntimeSaved(input, saved);
    } catch (compatibilityError) {
      try {
        const restored = await api.updateChannelConversation(groupConversation.id, conversationInput(groupConversation));
        reconcileGroup(restored);
      } catch {
        await refreshGroups();
        throw new Error(t("channelsPage.thisZotigodVersionDoesNotSupportChannelRuntime2"));
      }
      throw compatibilityError;
    }
    reconcileGroup(saved);
    setStatus(t("channelsPage.groupConnected"));
  };
  const topicModeGroup = selectedGroup?.chat_mode === "topic";
  const unconnectedGroups = groups.filter((group) => !group.enabled || !group.workspace_id);
  const connectedProjectGroups = projects.map((project) => ({
    project,
    groups: groups.filter((group) => group.enabled && workspaceById.get(group.workspace_id ?? "")?.project_id === project.id),
  })).filter((entry) => entry.groups.length > 0);
  const disconnectedWorkspaceGroups = groups.filter((group) => group.enabled && group.workspace_id && !workspaceById.has(group.workspace_id));
  const toggleCollapsed = (setter: typeof setCollapsedProjectIds, id: string) => setter((values) => {
    const next = new Set(values);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const renderGroup = (group: ChannelGroup) => {
    const workspace = group.workspace_id ? workspaceById.get(group.workspace_id) : undefined;
    const groupBinding = conversations.find((conversation) => conversation.id === group.conversation_id);
    const topics = group.session_strategy === "shared" && groupBinding?.session_id ? [{ ...groupBinding, display_name: t("channelsPage.sharedSession") }] : topicsByChat.get(group.chat_id) ?? [];
    const open = !collapsedGroupIds.has(group.chat_id);
    return <section className="workspace-group channels-chat-group" key={group.chat_id}>
      <div className="workspace-row-shell">
        <span className="channels-group-icon" aria-hidden="true"><MessageSquare size={15} strokeWidth={1.6} /></span>
        <button type="button" className={`workspace-row ${!sessionVisible && group.chat_id === selectedGroupId ? "selected" : ""}`} aria-label={`${open ? t("common.collapse") : t("common.expand")} ${group.name || group.chat_id}`} aria-expanded={open} title={workspace?.title ?? (!group.available ? t("channelsPage.noLongerAvailable") : t("channelsPage.notConnected"))} onClick={() => toggleCollapsed(setCollapsedGroupIds, group.chat_id)}><span>{group.name || group.chat_id}</span></button>
        <div className="workspace-row-actions"><button type="button" disabled={busy || !canConfigureChannelGroup(group)} aria-label={t("channelsPage.configure", { p0: group.name || group.chat_id })} title={t("channelsPage.groupSettings")} onClick={() => chooseGroup(group)}><Settings2 size={13} strokeWidth={1.8} /></button></div>
      </div>
      {open && group.enabled && topics.length > 0 && <div className="sidebar-session-list workspace-sessions channels-chat-conversations">{topics.map((conversation) => <div className={`sidebar-session channels-conversation-item ${sessionVisible && conversation.session_id === selectedSessionId ? "selected" : ""}`} key={conversation.id}><button disabled={busy || !conversation.session_id} onClick={() => conversation.session_id && run(() => onOpenSession(conversation.session_id!))}><span className="sidebar-session-title"><span>{conversation.display_name || t("channelsPage.topic", { p0: conversation.root_id!.slice(-8) })}</span></span></button>{conversation.session_id && <div className="sidebar-session-actions"><button disabled={busy} type="button" aria-label={t("channelsPage.openInSessions")} title={t("channelsPage.openInSessions")} onClick={() => run(() => onOpenSession(conversation.session_id!, true))}><ArrowUpRight size={12} /></button></div>}</div>)}</div>}
    </section>;
  };
  const renderAvailableGroup = (group: ChannelGroup) => <button disabled={busy || !canConfigureChannelGroup(group)} className={`channels-nav-row ${group.chat_id === selectedGroupId ? "is-active" : ""}`} key={group.chat_id} onClick={() => chooseGroup(group)}><MessageSquare size={15} /><span className="channels-nav-copy"><strong>{group.name || group.chat_id}</strong><small>{!group.available ? t("channelsPage.noLongerAvailable") : t("channelsPage.notConnected")}</small></span></button>;

  const navigation = <nav className="channels-browser" aria-label={t("channelsPage.channelConnectionsAndGroups")}>
    <header className="channels-browser-header"><button className="channels-back-button" type="button" onClick={onBack}><ArrowLeft size={14} /><span>{t("channelsPage.back")}</span></button><button className="channels-new-button" disabled={busy} aria-label={t("channelsPage.newConnection")} onClick={() => { setStatus(""); setCreatingConnection(true); setSelectedGroupId(""); setConnectionDraft(emptyConnection()); onShowConfiguration(); }}><Plus size={14} /><span>{t("channelsPage.new")}</span></button></header>
    <div className="channels-sidebar-heading"><span>{t("settingsPage.connections")}</span></div>
    {connections.map((connection) => <button disabled={busy} key={connection.id} aria-pressed={connection.id === selectedConnectionId && !selectedGroupId} className={`channels-nav-row ${connection.id === selectedConnectionId && !selectedGroupId ? "is-active" : ""}`} onClick={() => { setCreatingConnection(false); setSelectedGroupId(""); onShowConfiguration(); run(() => selectConnection(connection.id)); }}><Bot size={16} /><span className="channels-nav-copy"><strong>{connection.name}</strong><small>{t("channelsPage.feishu2")}{" "}{stateLabel(connection.status)}</small></span><i className={`channel-status ${connection.status}`} /></button>)}
    {selectedConnection && <>
      <div className="project-section-heading channels-project-heading"><span className="sidebar-section-title">{t("app.projects")}</span><div><button type="button" disabled={busy} aria-label={t("channelsPage.connectGroup")} aria-expanded={showAvailableGroups} title={t("channelsPage.connectGroup")} onClick={() => setShowAvailableGroups((value) => !value)}><Plus size={15} strokeWidth={1.8} /></button></div></div>
      {connectedProjectGroups.map(({ project, groups: projectGroups }) => { const open = !collapsedProjectIds.has(project.id); return <section className="project-group channels-project-group" key={project.id}><div className="project-row-shell"><button type="button" className="project-collapse-button" aria-label={`${open ? t("common.collapse") : t("common.expand")} ${project.name}`} aria-expanded={open} onClick={() => toggleCollapsed(setCollapsedProjectIds, project.id)}><ProjectDisclosureIcon open={open} /></button><button type="button" className="project-row" aria-expanded={open} onClick={() => toggleCollapsed(setCollapsedProjectIds, project.id)}><span>{project.name}</span></button></div>{open && <div className="workspace-list channels-group-list">{projectGroups.map(renderGroup)}</div>}</section>; })}
      {disconnectedWorkspaceGroups.length > 0 && <section className="channels-group"><h3>{t("channelsPage.unavailableWorkspace")}</h3>{disconnectedWorkspaceGroups.map(renderGroup)}</section>}
      {showAvailableGroups && <section className="channels-available-groups" aria-label={t("channelsPage.groupsAvailableToConnect")}>
        <div className="channels-sidebar-heading"><span>{t("channelsPage.connectGroup")}</span><button disabled={busy} aria-label={t("channelsPage.refreshGroups")} onClick={() => run(refreshGroups)}><RefreshCw size={13} /></button></div>
        {unconnectedGroups.length === 0 ? <p className="channels-sidebar-empty">{t("channelsPage.noUnconnectedGroupChatsFound")}</p> : unconnectedGroups.map(renderAvailableGroup)}
      </section>}
    </>}
  </nav>;

  return <section className="channels-workspace">
    {createPortal(navigation, navigationRoot)}
    <section className="channels-detail" hidden={sessionVisible}>
      <header><button ref={navigationButtonRef} className="web-navigation-toggle" type="button" onClick={onOpenNavigation} aria-label={t("app.openNavigation")} aria-expanded={navigationOpen}><PanelLeft size={18} /></button><div><h1>{selectedGroup ? selectedGroup.name || t("channelsPage.groupChat") : creatingConnection ? t("channelsPage.newFeishuConnection") : selectedConnection?.name ?? t("channelsPage.newFeishuConnection")}</h1><p>{selectedGroup ? t("channelsPage.feishuGroupOn", { p0: hostName }) : creatingConnection || !selectedConnection ? t("channelsPage.connectAnotherFeishuBotTo", { p0: hostName }) : t("channelsPage.feishuConnectionOn", { p0: hostName })}</p></div></header>
      <div className="channels-detail-scroll">
        {status && <div className="channels-notice" role="status"><CircleAlert size={15} />{status}</div>}
        {!selectedGroup && <div className="channels-grid">
          <section className="channels-card"><header><h2>{t("channelsPage.connection")}</h2><p className="channels-help">{t("channelsPage.eachBotKeepsItsOwnLongConnectionChoose")}</p></header>
            <label>{t("hostShell.name")}<input value={connectionDraft.name} onChange={(event) => setConnectionDraft({ ...connectionDraft, name: event.target.value })} /></label>
            <label>{t("channelsPage.appId")}<input value={connectionDraft.app_id} onChange={(event) => setConnectionDraft({ ...connectionDraft, app_id: event.target.value })} /></label>
            <label>{t("channelsPage.appSecret")}<input type="password" value={connectionDraft.app_secret ?? ""} placeholder={!creatingConnection && selectedConnection?.has_secret ? t("channelsPage.savedLeaveBlankToKeep") : t("channelsPage.requiredToEnable")} autoComplete="new-password" onChange={(event) => setConnectionDraft({ ...connectionDraft, app_secret: event.target.value })} /></label>
            {!creatingConnection && <label>{t("channelsPage.applicationOwner")}<input readOnly value={ownerSenderIDs.join(", ")} placeholder={selectedConnection?.status === "starting" ? t("channelsPage.resolvingFromFeishu") : t("directoryBrowser.unavailable")} /><small>{t("channelsPage.resolvedFromTheFeishuApplicationOwnerWhenThe")}</small></label>}
            <label>{t("channelsPage.executionDisplay")}<select value={connectionDraft.progress_mode} onChange={(event) => setConnectionDraft({ ...connectionDraft, progress_mode: event.target.value as ChannelConnectionInput["progress_mode"] })}><option value="auto">{t("channelsPage.cotWithCardFallback")}</option><option value="cot">{t("channelsPage.requireCot")}</option><option value="interactive_card">{t("channelsPage.interactiveCard")}</option></select><small>{t("channelsPage.autoFallsBackOnlyWhenFeishuRejectsCot")}</small></label>
            <label className="channels-check"><input type="checkbox" checked={connectionDraft.enabled} onChange={(event) => setConnectionDraft({ ...connectionDraft, enabled: event.target.checked })} />{t("channelsPage.enableLongConnection")}</label>
          </section>
          <section className="channels-card"><header><h2>{t("channelsPage.promptAndApproval")}</h2><p className="channels-help">{t("channelsPage.theseOwnerInstructionsAreAppendedAfterZotigoS")}</p></header>
            <label>{t("channelsPage.permissions")}<select value={connectionDraft.approval_policy || "auto"} onChange={(event) => setConnectionDraft({ ...connectionDraft, approval_policy: event.target.value as "auto" | "bypass_permissions" })}><option value="auto">{t("channelsPage.auto")}</option><option value="bypass_permissions">{t("channelsPage.fullAccess")}</option></select><small>{t("channelsPage.fullAccessSkipsToolApprovalAppliesWhenThe")}</small></label>
            <label>{t("channelsPage.systemPromptAdditions")}<textarea rows={7} value={connectionDraft.agent_instructions} onChange={(event) => setConnectionDraft({ ...connectionDraft, agent_instructions: event.target.value })} /></label>
            <label>{t("channelsPage.approvalPromptAdditions")}<textarea rows={8} value={connectionDraft.approval_instructions} onChange={(event) => setConnectionDraft({ ...connectionDraft, approval_instructions: event.target.value })} /></label>
            <label className="channels-check"><input type="checkbox" checked={connectionDraft.review_all_tools} onChange={(event) => setConnectionDraft({ ...connectionDraft, review_all_tools: event.target.checked })} />{t("channelsPage.enableAutomaticApprovalReviewInAutoMode")}</label>
            <p className="channels-help">{t("channelsPage.zotigoReviewsOtherwiseSafeToolCallsCodexAutomatically")}</p>
            <div className="channels-capability"><CheckCircle2 size={15} /><span>{t("channelsPage.cotExecutionDisplaySupported")}</span><small>{t("channelsPage.theFinalAnswerIsSentSeparatelyInThe")}</small></div>
            <div className="channels-actions channels-form-actions"><button className="primary" disabled={busy} onClick={() => run(async () => { const input = { ...connectionDraft, allow_chat_ids: [] }; if (!input.app_secret) delete input.app_secret; const saved = !creatingConnection && selectedConnection ? await api.updateChannelConnection(selectedConnection.id, input) : await api.createChannelConnection(input); await load(saved.id, true); setStatus(t("channelsPage.connectionSaved")); })}><Save size={14} />{t("app.save")}</button>{!creatingConnection && selectedConnection && <button disabled={busy} onClick={() => { setStatus(""); setDeleteTarget(selectedConnection); }}><Trash2 size={14} />{t("app.delete")}</button>}<small>{t("channelsPage.savesTheConnectionPromptAndApprovalSettingsAbove")}</small></div>
          </section>
        </div>}
        {selectedGroup && groupConversation && groupDraft && <div className="channels-grid">
          <section className="channels-card"><header><h2>{t("channelsPage.workspace")}</h2><p className="channels-help">{t("channelsPage.chooseWhetherThisGroupCreatesOneSessionPer")}</p></header>
            <code>{selectedGroup.chat_id}</code>
            <label>{t("channelsPage.sessionStrategy")}<select value={groupDraft.session_strategy} onChange={(event) => setGroupDraft({ ...groupDraft, session_strategy: event.target.value as ChannelConversationInput["session_strategy"], session_id: "" })}><option value="topic">{t("channelsPage.newSessionPerTopic")}</option><option value="shared" disabled={topicModeGroup}>{t("channelsPage.sharedSessionInGroup")}</option></select><small>{topicModeGroup ? t("channelsPage.feishuTopicGroupsUseOneSessionPerTopic") : groupDraft.session_strategy === "shared" ? t("channelsPage.everyMentionContinuesOneSessionAllRepliesStay") : t("channelsPage.aTopLevelMentionCreatesASessionReplies")}</small></label>
            <label>{t("app.project")}<select value={groupProjectId} onChange={(event) => { setGroupProjectId(event.target.value); setGroupDraft({ ...groupDraft, workspace_id: "", session_id: "" }); }}><option value="">{t("channelsPage.selectAProject")}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>{t("channelsPage.workspace")}<select value={groupDraft.workspace_id} disabled={!groupProjectId} onChange={(event) => setGroupDraft({ ...groupDraft, workspace_id: event.target.value, session_id: "", profile_name: "" })}><option value="">{t("channelsPage.selectAReadyWorkspace")}</option>{visibleWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}</select><small>{t("channelsPage.changingThisAffectsNewlyCreatedChannelSessionsExisting")}</small></label>
            {groupDraft.session_strategy === "shared" && <label>{t("channelsPage.sharedSession2")}<select value={groupDraft.session_id} disabled={!selectedWorkspace} onChange={(event) => { const sessionID = event.target.value; if (!sessionID) { setGroupDraft({ ...groupDraft, session_id: "" }); return; } const session = sessions.find((value) => value.id === sessionID); setGroupDraft({ ...groupDraft, session_id: sessionID, agent: session?.agent ?? groupDraft.agent, profile_name: session?.profile ?? "", model: session?.model ?? "", reasoning_effort: session?.reasoning_effort ?? "" }); }}><option value="">{t("channelsPage.createOnFirstMention")}</option>{compatibleSessions.map((session) => <option key={session.id} value={session.id}>{sessionTitleById.get(session.id)?.trim() || t("app.newSession")} {"·"}{" "}{session.id}{session.profile || session.model ? ` · ${session.profile || session.model}` : ""}</option>)}</select><small>{t("channelsPage.existingSessionsMustBeIdleAndNotConnected")}</small></label>}
            <div className="channels-runtime-setting"><span>{t("favoriteModelSettings.runtime2")}</span><RuntimeSettingsPicker
              favorites={{ ...favorites, select: (favorite) => setGroupDraft(favorite.agent === "codex"
                ? { ...groupDraft, agent: "codex", model: favorite.model, reasoning_effort: favorite.reasoningEffort, profile_name: "" }
                : { ...groupDraft, agent: "zotigo", profile_name: favorite.profile, model: "", reasoning_effort: "" }) }}
              agents={agents}
              selectedAgent={groupDraft.agent}
              onSelectAgent={(agent) => {
                if (agent === "zotigo") { setGroupDraft({ ...groupDraft, agent, model: "", reasoning_effort: "" }); return; }
                const model = codexModels.find((value) => value.is_default) ?? codexModels[0];
                setGroupDraft({ ...groupDraft, agent, profile_name: "", model: model?.id ?? "", reasoning_effort: compatibleReasoningEffort(model?.supported_reasoning_efforts ?? [], groupDraft.reasoning_effort) });
              }}
              profiles={profiles}
              selectedProfile={groupDraft.profile_name}
              onSelectProfile={(profile_name) => setGroupDraft({ ...groupDraft, profile_name })}
              codexModels={codexModels}
              selectedCodexModel={groupDraft.model}
              onSelectCodexModel={(modelID) => { const model = codexModels.find((value) => value.id === modelID); setGroupDraft({ ...groupDraft, model: modelID, reasoning_effort: compatibleReasoningEffort(model?.supported_reasoning_efforts ?? [], groupDraft.reasoning_effort) }); }}
              selectedCodexReasoningEffort={groupDraft.reasoning_effort}
              onSelectCodexReasoningEffort={(reasoning_effort) => setGroupDraft({ ...groupDraft, reasoning_effort })}
              allowDefaultProfile
              defaultProfileLabel={defaultProfile ? t("channels.workspaceDefault", { profile: defaultProfile }) : t("channelsPage.workspaceDefault2")}
              profileDisabled={profilesLoading}
              codexSettingsDisabled={codexModels.length === 0}
              disabled={busy || !groupDraft.workspace_id || Boolean(groupDraft.session_id)}
            /><small>{groupDraft.session_strategy === "shared" ? t("channelsPage.usedIfZotigoCreatesTheSharedSessionOn") : t("channelsPage.usedWhenANewFeishuTopicCreatesA")}</small></div>
            <label>{t("channelsPage.whoCanTrigger")}<select value={groupDraft.sender_policy} onChange={(event) => setGroupDraft({ ...groupDraft, sender_policy: event.target.value as ChannelConversationInput["sender_policy"], allowed_sender_ids: event.target.value === "selected" ? groupDraft.allowed_sender_ids : [] })}><option value="owners">{t("channelsPage.applicationOwnerOnly")}</option><option value="all">{t("channelsPage.allGroupMembers")}</option><option value="selected">{t("channelsPage.selectedGroupMembers")}</option></select><small>{t("channelsPage.thisPolicyAppliesImmediatelyToExistingChannelSessions")}</small></label>
            {groupDraft.sender_policy === "selected" && <div className="channels-member-field"><span>{t("channelsPage.groupMembers")}</span><div className="channels-member-picker">{selectableGroupMembers.map((member) => { const selected = groupDraft.allowed_sender_ids.includes(member.id); return <label className="channels-member-option" key={member.id}><input type="checkbox" disabled={groupMembersLoading || Boolean(groupMembersError)} checked={selected} onChange={() => setGroupDraft({ ...groupDraft, allowed_sender_ids: selected ? groupDraft.allowed_sender_ids.filter((id) => id !== member.id) : [...groupDraft.allowed_sender_ids, member.id] })} /><span>{member.display_name || member.id}</span></label>; })}</div><small>{groupMembersLoading ? t("channelsPage.loadingMembersFromFeishu") : groupMembersError ? t("channelsPage.existingSelectionsArePreservedGrantImChatMembers", { p0: groupMembersError }) : t("channelsPage.selectOneOrMoreMembers")}</small></div>}
            <div className="channels-trigger"><strong>{t("channelsPage.trigger")}</strong><span>{t("channelsPage.mentionRequired")}</span><small>{groupDraft.session_strategy === "shared" ? t("channelsPage.everyAcceptedGroupMessageRequiresAMentionAnd") : t("channelsPage.aTopLevelMentionStartsASessionTopic")}</small></div>
          </section>
          <section className="channels-card"><header><h2>{t("channelsPage.promptAndApproval")}</h2><p className="channels-help">{t("channelsPage.useConnectionDefaultsOrReplaceTheOwnerAdditions")}</p></header>
            <label>{t("channelsPage.permissions")}<select value={groupDraft.approval_policy || ""} onChange={(event) => setGroupDraft({ ...groupDraft, approval_policy: event.target.value as "" | "auto" | "bypass_permissions" })}><option value="">{t("channelsPage.inheritConnection")}</option><option value="auto">{t("channelsPage.auto")}</option><option value="bypass_permissions">{t("channelsPage.fullAccess")}</option></select><small>{t("channelsPage.fullAccessSkipsToolApprovalChangesApplyTo")}</small></label>
            {(["agent", "approval"] as const).map((kind) => { const modeKey = `${kind}_instructions_mode` as const; const textKey = `${kind}_instructions` as const; return <div className="channels-override" key={kind}><label>{kind === "agent" ? t("channelsPage.systemPrompt") : t("channelsPage.approvalPrompt")}<select value={groupDraft[modeKey]} onChange={(event) => setGroupDraft({ ...groupDraft, [modeKey]: event.target.value as "inherit" | "replace" })}><option value="inherit">{t("channelsPage.inheritConnection")}</option><option value="replace">{t("channelsPage.replaceOwnerAdditions")}</option></select><textarea disabled={groupDraft[modeKey] === "inherit"} rows={5} value={groupDraft[textKey]} onChange={(event) => setGroupDraft({ ...groupDraft, [textKey]: event.target.value })} /></label></div>; })}
            <label>{t("channelsPage.automaticApprovalReview")}<select value={groupDraft.review_all_tools === undefined ? "inherit" : groupDraft.review_all_tools ? "true" : "false"} onChange={(event) => setGroupDraft({ ...groupDraft, review_all_tools: event.target.value === "inherit" ? undefined : event.target.value === "true" })}><option value="inherit">{t("channelsPage.inheritConnection")}</option><option value="true">{t("channelsPage.enabled")}</option><option value="false">{t("channelsPage.disabled")}</option></select><small>{t("channelsPage.inAutoModeZotigoReviewsOtherwiseSafeTool")}</small></label>
            <div className="channels-actions channels-form-actions"><button className="primary" disabled={busy || profilesLoading || !groupDraft.workspace_id || (topicModeGroup && groupDraft.session_strategy === "shared") || (groupDraft.sender_policy === "selected" && groupDraft.allowed_sender_ids.length === 0) || !runtimeValid} onClick={() => run(saveGroup)}><Save size={14} />{groupDraft.enabled ? t("app.save") : t("channelsPage.connect")}</button>{groupDraft.enabled && <button disabled={busy} onClick={() => run(async () => { const saved = await api.updateChannelConversation(groupConversation.id, { ...groupDraft, session_id: "", workspace_id: "", enabled: false }); reconcileGroup(saved); setStatus(t("channelsPage.groupDisconnected")); })}>{t("channelsPage.disconnect")}</button>}<small>{t("channelsPage.promptChangesApplyToExistingChannelSessionsWhen")}</small></div>
          </section>
        </div>}
        {selectedGroup && !groupConversation && <div className="channels-empty"><CircleAlert size={18} /><p>{t("channelsPage.thisGroupCouldNotBePreparedForConfiguration")}</p></div>}
      </div>
    </section>
    {deleteTarget && <ConfirmActionDialog title={t("channelsPage.delete", { p0: deleteTarget.name })} description={t("channelsPage.thisRemovesTheConnectionAndItsCachedChannel")} action={t("channels.deleteConnectionAction")} busy={busy} error={status} onCancel={() => setDeleteTarget(null)} onConfirm={() => run(async () => { await api.deleteChannelConnection(deleteTarget.id); setDeleteTarget(null); await load("", true); })} />}
  </section>;
}
