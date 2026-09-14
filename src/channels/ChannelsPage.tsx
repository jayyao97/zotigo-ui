import { ArrowLeft, ArrowUpRight, Bot, CheckCircle2, CircleAlert, MessageSquare, PanelLeft, Plus, RefreshCw, Save, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { canConfigureChannelGroup, channelGroupName, type ChannelConnection, type ChannelConnectionInput, type ChannelConversation, type ChannelConversationInput, type ChannelGroup } from "../../shared/channels";
import type { DesktopProject, DesktopWorkspace } from "../../shared/clientTypes";
import { useClient } from "../ClientContext";
import { ProjectDisclosureIcon } from "../SidebarDisclosureIcons";

const defaultApprovalInstructions = "Only auto-approve actions necessary for the request that are reversible and confined to the bound workspace. Request owner approval for destructive changes, credential access, external publishing or messaging, permission changes, and ambiguity with material impact.";
const emptyConnection = (): ChannelConnectionInput => ({ provider: "feishu", name: "Feishu", app_id: "", app_secret: "", enabled: false, allow_chat_ids: [], owner_sender_ids: [], agent_instructions: "", approval_instructions: defaultApprovalInstructions, review_all_tools: true, progress_mode: "auto" });
const connectionInput = (connection: ChannelConnection): ChannelConnectionInput => ({ provider: "feishu", name: connection.name, app_id: connection.app_id, enabled: connection.enabled, allow_chat_ids: [], owner_sender_ids: connection.owner_sender_ids ?? [], agent_instructions: connection.agent_instructions, approval_instructions: connection.approval_instructions, review_all_tools: connection.review_all_tools, progress_mode: connection.progress_mode });
const conversationInput = (conversation: ChannelConversation, fallbackSenders: string[]): ChannelConversationInput => ({ display_name: channelGroupName([conversation], conversation.chat_id), session_id: "", workspace_id: conversation.workspace_id ?? "", enabled: conversation.enabled, allowed_sender_ids: conversation.allowed_sender_ids.length ? conversation.allowed_sender_ids : fallbackSenders, agent_instructions_mode: conversation.agent_instructions_mode, agent_instructions: conversation.agent_instructions, approval_instructions_mode: conversation.approval_instructions_mode, approval_instructions: conversation.approval_instructions, review_all_tools: conversation.review_all_tools ?? undefined });

interface ChannelsPageProps {
  hostName: string;
  projects: DesktopProject[];
  workspaces: DesktopWorkspace[];
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

export function ChannelsPage({ hostName, projects, workspaces, navigationRoot, navigationButtonRef, navigationOpen, sessionVisible, selectedSessionId, onOpenNavigation, onShowConfiguration, onBack, onOpenSession }: ChannelsPageProps) {
  const { api } = useClient();
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<ChannelConnectionInput>(emptyConnection);
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupDraft, setGroupDraft] = useState<ChannelConversationInput | null>(null);
  const [groupProjectId, setGroupProjectId] = useState("");
  const [showAvailableGroups, setShowAvailableGroups] = useState(false);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const selectedConnection = connections.find((value) => value.id === selectedConnectionId);
  const selectedGroup = groups.find((value) => value.chat_id === selectedGroupId);
  const groupConversation = conversations.find((value) => value.id === selectedGroup?.conversation_id && !value.root_id);
  const selectedConnectionConfig = selectedConnection ? JSON.stringify(connectionInput(selectedConnection)) : "";
  const groupConversationConfig = groupConversation ? JSON.stringify(groupConversation) : "";
  const ownerSenderIDs = selectedConnection?.owner_sender_ids ?? [];
  const ownerSenderIDsConfig = ownerSenderIDs.join("\n");
  const startingConnectionIds = connections.filter((value) => value.status === "starting").map((value) => value.id).sort().join("\n");
  const readyWorkspaces = useMemo(() => workspaces.filter((value) => value.status === "ready"), [workspaces]);
  const visibleWorkspaces = useMemo(() => readyWorkspaces.filter((value) => value.project_id === groupProjectId), [readyWorkspaces, groupProjectId]);
  const workspaceById = useMemo(() => new Map(workspaces.map((value) => [value.id, value])), [workspaces]);
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
    if (!connectionId) return { groups: [] as ChannelGroup[], conversations: [] as ChannelConversation[], warning: "" };
    // Group discovery materializes each rootless configuration record. Read the
    // conversations afterwards so a newly discovered group is immediately editable.
    let nextGroups: ChannelGroup[] = [];
    let warning = "";
    try {
      nextGroups = await api.listChannelGroups(connectionId);
    } catch (error) {
      warning = error instanceof Error ? `Could not refresh Feishu groups: ${error.message}` : "Could not refresh Feishu groups.";
    }
    const nextConversations = await api.listChannelConversations(connectionId);
    const knownChatIDs = new Set(nextGroups.map((group) => group.chat_id));
    for (const conversation of nextConversations) {
      if (conversation.chat_type !== "group" || conversation.root_id || knownChatIDs.has(conversation.chat_id)) continue;
      nextGroups.push({ chat_id: conversation.chat_id, name: channelGroupName(nextConversations, conversation.chat_id), available: false, conversation_id: conversation.id, workspace_id: conversation.workspace_id, enabled: conversation.enabled, allowed_sender_ids: conversation.allowed_sender_ids });
    }
    return { groups: nextGroups, conversations: nextConversations, warning };
  }
  async function load(preferredConnection?: string, showConnection = false) {
    const request = ++requestVersion.current;
    const nextConnections = await api.listChannelConnections();
    if (request !== requestVersion.current) return;
    const requested = preferredConnection ?? selectedConnectionId;
    const connectionId = nextConnections.some((value) => value.id === requested) ? requested : nextConnections[0]?.id ?? "";
    const data = await loadConnectionData(connectionId);
    if (request !== requestVersion.current) return;
    setConnections(nextConnections); setSelectedConnectionId(connectionId); if (showConnection) setCreatingConnection(false); setSelectedGroupId(""); setShowAvailableGroups(false); setCollapsedProjectIds(new Set()); setCollapsedGroupIds(new Set()); setGroups(data.groups); setConversations(data.conversations);
    if (data.warning) setStatus(data.warning);
  }
  async function selectConnection(id: string) {
    const request = ++requestVersion.current;
    const data = await loadConnectionData(id);
    if (request !== requestVersion.current) return;
    setSelectedConnectionId(id); setCreatingConnection(false); setSelectedGroupId(""); setShowAvailableGroups(false); setCollapsedProjectIds(new Set()); setCollapsedGroupIds(new Set()); setGroups(data.groups); setConversations(data.conversations);
    if (data.warning) setStatus(data.warning);
  }
  async function refreshGroups() {
    if (!selectedConnectionId) return;
    const request = ++requestVersion.current;
    const data = await loadConnectionData(selectedConnectionId);
    if (request !== requestVersion.current) return;
    setGroups(data.groups); setConversations(data.conversations);
    if (data.warning) setStatus(data.warning);
  }

  useEffect(() => {
    let active = true;
    void load().catch((error: Error) => { if (active) setStatus(error.message); });
    return () => { active = false; requestVersion.current++; };
  }, [api]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
    const draft = conversationInput(groupConversation, ownerSenderIDs);
    setGroupDraft(draft);
    setGroupProjectId(draft.workspace_id ? workspaceById.get(draft.workspace_id)?.project_id ?? "" : "");
  }, [groupConversationConfig, ownerSenderIDsConfig, workspaceById]);

  const run = (operation: () => Promise<void>, onError?: () => void) => { setBusy(true); setStatus(""); void operation().catch((error: Error) => { if (mounted.current) { setStatus(error.message); onError?.(); } }).finally(() => { if (mounted.current) setBusy(false); }); };
  const chooseGroup = (group: ChannelGroup) => { setCreatingConnection(false); setSelectedGroupId(group.chat_id); onShowConfiguration(); };
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
    const topics = topicsByChat.get(group.chat_id) ?? [];
    const open = !collapsedGroupIds.has(group.chat_id);
    return <section className="workspace-group channels-chat-group" key={group.chat_id}>
      <div className="workspace-row-shell">
        <span className="channels-group-icon" aria-hidden="true"><MessageSquare size={15} strokeWidth={1.6} /></span>
        <button type="button" className={`workspace-row ${!sessionVisible && group.chat_id === selectedGroupId ? "selected" : ""}`} aria-label={`${open ? "Collapse" : "Expand"} ${group.name || group.chat_id}`} aria-expanded={open} title={workspace?.title ?? (!group.available ? "No longer available" : "Not connected")} onClick={() => toggleCollapsed(setCollapsedGroupIds, group.chat_id)}><span>{group.name || group.chat_id}</span></button>
        <div className="workspace-row-actions"><button type="button" disabled={busy || !canConfigureChannelGroup(group)} aria-label={`Configure ${group.name || group.chat_id}`} title="Group settings" onClick={() => chooseGroup(group)}><Settings2 size={13} strokeWidth={1.8} /></button></div>
      </div>
      {open && group.enabled && topics.length > 0 && <div className="sidebar-session-list workspace-sessions channels-chat-conversations">{topics.map((conversation) => <div className={`sidebar-session channels-conversation-item ${sessionVisible && conversation.session_id === selectedSessionId ? "selected" : ""}`} key={conversation.id}><button disabled={busy || !conversation.session_id} onClick={() => conversation.session_id && run(() => onOpenSession(conversation.session_id!))}><span className="sidebar-session-title"><span>{conversation.display_name || `Topic · ${conversation.root_id!.slice(-8)}`}</span></span></button>{conversation.session_id && <div className="sidebar-session-actions"><button disabled={busy} type="button" aria-label="Open in Sessions" title="Open in Sessions" onClick={() => run(() => onOpenSession(conversation.session_id!, true))}><ArrowUpRight size={12} /></button></div>}</div>)}</div>}
    </section>;
  };
  const renderAvailableGroup = (group: ChannelGroup) => <button disabled={busy || !canConfigureChannelGroup(group)} className={`channels-nav-row ${group.chat_id === selectedGroupId ? "is-active" : ""}`} key={group.chat_id} onClick={() => chooseGroup(group)}><MessageSquare size={15} /><span className="channels-nav-copy"><strong>{group.name || group.chat_id}</strong><small>{!group.available ? "No longer available" : "Not connected"}</small></span></button>;

  const navigation = <nav className="channels-browser" aria-label="Channel connections and groups">
    <header className="channels-browser-header"><button className="channels-back-button" type="button" onClick={onBack}><ArrowLeft size={14} /><span>Back</span></button><button className="channels-new-button" disabled={busy} aria-label="New connection" onClick={() => { setCreatingConnection(true); setSelectedGroupId(""); setConnectionDraft(emptyConnection()); onShowConfiguration(); }}><Plus size={14} /><span>New</span></button></header>
    <div className="channels-sidebar-heading"><span>Connections</span></div>
    {connections.map((connection) => <button disabled={busy} key={connection.id} aria-pressed={connection.id === selectedConnectionId && !selectedGroupId} className={`channels-nav-row ${connection.id === selectedConnectionId && !selectedGroupId ? "is-active" : ""}`} onClick={() => { setCreatingConnection(false); setSelectedGroupId(""); onShowConfiguration(); run(() => selectConnection(connection.id)); }}><Bot size={16} /><span className="channels-nav-copy"><strong>{connection.name}</strong><small>Feishu · {connection.status}</small></span><i className={`channel-status ${connection.status}`} /></button>)}
    {selectedConnection && <>
      <div className="project-section-heading channels-project-heading"><span className="sidebar-section-title">Projects</span><div><button type="button" disabled={busy} aria-label="Connect group" aria-expanded={showAvailableGroups} title="Connect group" onClick={() => setShowAvailableGroups((value) => !value)}><Plus size={15} strokeWidth={1.8} /></button></div></div>
      {connectedProjectGroups.map(({ project, groups: projectGroups }) => { const open = !collapsedProjectIds.has(project.id); return <section className="project-group channels-project-group" key={project.id}><div className="project-row-shell"><button type="button" className="project-collapse-button" aria-label={`${open ? "Collapse" : "Expand"} ${project.name}`} aria-expanded={open} onClick={() => toggleCollapsed(setCollapsedProjectIds, project.id)}><ProjectDisclosureIcon open={open} /></button><button type="button" className="project-row" aria-expanded={open} onClick={() => toggleCollapsed(setCollapsedProjectIds, project.id)}><span>{project.name}</span></button></div>{open && <div className="workspace-list channels-group-list">{projectGroups.map(renderGroup)}</div>}</section>; })}
      {disconnectedWorkspaceGroups.length > 0 && <section className="channels-group"><h3>Unavailable Workspace</h3>{disconnectedWorkspaceGroups.map(renderGroup)}</section>}
      {showAvailableGroups && <section className="channels-available-groups" aria-label="Groups available to connect">
        <div className="channels-sidebar-heading"><span>Connect group</span><button disabled={busy} aria-label="Refresh groups" onClick={() => run(refreshGroups)}><RefreshCw size={13} /></button></div>
        {unconnectedGroups.length === 0 ? <p className="channels-sidebar-empty">No unconnected group chats found.</p> : unconnectedGroups.map(renderAvailableGroup)}
      </section>}
    </>}
  </nav>;

  return <section className="channels-workspace">
    {createPortal(navigation, navigationRoot)}
    <section className="channels-detail" hidden={sessionVisible}>
      <header><button ref={navigationButtonRef} className="web-navigation-toggle" type="button" onClick={onOpenNavigation} aria-label="Open navigation" aria-expanded={navigationOpen}><PanelLeft size={18} /></button><div><h1>{selectedGroup ? selectedGroup.name || "Group chat" : creatingConnection ? "New Feishu connection" : selectedConnection?.name ?? "New Feishu connection"}</h1><p>{selectedGroup ? `Feishu group on ${hostName}` : creatingConnection || !selectedConnection ? `Connect another Feishu bot to ${hostName}` : `Feishu connection on ${hostName}`}</p></div></header>
      <div className="channels-detail-scroll">
        {status && <div className="channels-notice" role="status"><CircleAlert size={15} />{status}</div>}
        {!selectedGroup && <div className="channels-grid">
          <section className="channels-card"><header><h2>Connection</h2><p className="channels-help">Each bot keeps its own long connection. Choose which discovered groups may use Zotigo.</p></header>
            <label>Name<input value={connectionDraft.name} onChange={(event) => setConnectionDraft({ ...connectionDraft, name: event.target.value })} /></label>
            <label>App ID<input value={connectionDraft.app_id} onChange={(event) => setConnectionDraft({ ...connectionDraft, app_id: event.target.value })} /></label>
            <label>App secret<input type="password" value={connectionDraft.app_secret ?? ""} placeholder={!creatingConnection && selectedConnection?.has_secret ? "Saved — leave blank to keep" : "Required to enable"} autoComplete="new-password" onChange={(event) => setConnectionDraft({ ...connectionDraft, app_secret: event.target.value })} /></label>
            <label>Owner sender IDs<textarea rows={2} value={connectionDraft.owner_sender_ids.join("\n")} placeholder="One Feishu open_id per line" onChange={(event) => setConnectionDraft({ ...connectionDraft, owner_sender_ids: event.target.value.split(/\s+/).filter(Boolean) })} /><small>Owners may edit channel settings and are identified to the approval agent.</small></label>
            <label>Execution display<select value={connectionDraft.progress_mode} onChange={(event) => setConnectionDraft({ ...connectionDraft, progress_mode: event.target.value as ChannelConnectionInput["progress_mode"] })}><option value="auto">COT, with card fallback</option><option value="cot">Require COT</option><option value="interactive_card">Interactive card</option></select><small>Auto falls back only when Feishu rejects COT before the Agent starts.</small></label>
            <label className="channels-check"><input type="checkbox" checked={connectionDraft.enabled} onChange={(event) => setConnectionDraft({ ...connectionDraft, enabled: event.target.checked })} />Enable long connection</label>
            <div className="channels-actions"><button className="primary" disabled={busy} onClick={() => run(async () => { const input = { ...connectionDraft, allow_chat_ids: [] }; if (!input.app_secret) delete input.app_secret; const saved = !creatingConnection && selectedConnection ? await api.updateChannelConnection(selectedConnection.id, input) : await api.createChannelConnection(input); await load(saved.id, true); setStatus("Connection saved."); })}><Save size={14} />Save</button>{!creatingConnection && selectedConnection && <button disabled={busy} onClick={() => run(async () => { await api.deleteChannelConnection(selectedConnection.id); await load("", true); })}><Trash2 size={14} />Delete</button>}</div>
          </section>
          <section className="channels-card"><header><h2>Prompt and approval</h2><p className="channels-help">These owner instructions are appended after Zotigo's built-in rules.</p></header>
            <label>System prompt additions<textarea rows={7} value={connectionDraft.agent_instructions} onChange={(event) => setConnectionDraft({ ...connectionDraft, agent_instructions: event.target.value })} /></label>
            <label>Approval prompt additions<textarea rows={8} value={connectionDraft.approval_instructions} onChange={(event) => setConnectionDraft({ ...connectionDraft, approval_instructions: event.target.value })} /></label>
            <label className="channels-check"><input type="checkbox" checked={connectionDraft.review_all_tools} onChange={(event) => setConnectionDraft({ ...connectionDraft, review_all_tools: event.target.checked })} />Run all otherwise-safe tool calls through the approval classifier</label>
            <div className="channels-capability"><CheckCircle2 size={15} /><span>COT execution display supported</span><small>The final answer is sent separately in the same Feishu topic.</small></div>
          </section>
        </div>}
        {selectedGroup && groupConversation && groupDraft && <div className="channels-grid">
          <section className="channels-card"><header><h2>Workspace</h2><p className="channels-help">Every new top-level @mention creates a Zotigo Session here. Replies in that Feishu topic continue the same Session.</p></header>
            <code>{selectedGroup.chat_id}</code>
            <label>Project<select value={groupProjectId} onChange={(event) => { setGroupProjectId(event.target.value); setGroupDraft({ ...groupDraft, workspace_id: "" }); }}><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>Workspace<select value={groupDraft.workspace_id} disabled={!groupProjectId} onChange={(event) => setGroupDraft({ ...groupDraft, workspace_id: event.target.value })}><option value="">Select a ready workspace</option>{visibleWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}</select><small>Changing this affects new Feishu topics. Existing topic Sessions keep their current Workspace.</small></label>
            <label>Allowed sender IDs<textarea rows={3} value={groupDraft.allowed_sender_ids.join("\n")} placeholder="One Feishu open_id per line" onChange={(event) => setGroupDraft({ ...groupDraft, allowed_sender_ids: event.target.value.split(/\s+/).filter(Boolean) })} /><small>Only these people can trigger Zotigo in this group. Connection owners are filled in by default.</small></label>
            <div className="channels-trigger"><strong>Trigger</strong><span>@mention required</span><small>A top-level mention starts a Session; topic replies continue it without another mention.</small></div>
            <div className="channels-actions"><button className="primary" disabled={busy || !groupDraft.workspace_id || groupDraft.allowed_sender_ids.length === 0} onClick={() => run(async () => { const saved = await api.updateChannelConversation(groupConversation.id, { ...groupDraft, display_name: selectedGroup.name || selectedGroup.chat_id, session_id: "", enabled: true }); setConversations((values) => values.map((value) => value.id === saved.id ? saved : value)); setGroups((values) => values.map((value) => value.chat_id === selectedGroup.chat_id ? { ...value, workspace_id: saved.workspace_id, enabled: saved.enabled, allowed_sender_ids: saved.allowed_sender_ids } : value)); setGroupDraft(conversationInput(saved, selectedConnection?.owner_sender_ids ?? [])); setStatus("Group connected."); })}><Save size={14} />{groupDraft.enabled ? "Save" : "Connect"}</button>{groupDraft.enabled && <button disabled={busy} onClick={() => run(async () => { const saved = await api.updateChannelConversation(groupConversation.id, { ...groupDraft, session_id: "", workspace_id: "", enabled: false }); setConversations((values) => values.map((value) => value.id === saved.id ? saved : value)); setGroups((values) => values.map((value) => value.chat_id === selectedGroup.chat_id ? { ...value, workspace_id: "", enabled: false } : value)); setGroupDraft(conversationInput(saved, selectedConnection?.owner_sender_ids ?? [])); setGroupProjectId(""); setStatus("Group disconnected."); })}>Disconnect</button>}</div>
          </section>
          <section className="channels-card"><header><h2>Prompt and approval</h2><p className="channels-help">Use connection defaults or replace the owner additions for this group.</p></header>
            {(["agent", "approval"] as const).map((kind) => { const modeKey = `${kind}_instructions_mode` as const; const textKey = `${kind}_instructions` as const; return <div className="channels-override" key={kind}><label>{kind === "agent" ? "System prompt" : "Approval prompt"}<select value={groupDraft[modeKey]} onChange={(event) => setGroupDraft({ ...groupDraft, [modeKey]: event.target.value as "inherit" | "replace" })}><option value="inherit">Inherit connection</option><option value="replace">Replace owner additions</option></select><textarea disabled={groupDraft[modeKey] === "inherit"} rows={5} value={groupDraft[textKey]} onChange={(event) => setGroupDraft({ ...groupDraft, [textKey]: event.target.value })} /></label></div>; })}
            <label>Review all tools<select value={groupDraft.review_all_tools === undefined ? "inherit" : groupDraft.review_all_tools ? "true" : "false"} onChange={(event) => setGroupDraft({ ...groupDraft, review_all_tools: event.target.value === "inherit" ? undefined : event.target.value === "true" })}><option value="inherit">Inherit connection</option><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          </section>
        </div>}
        {selectedGroup && !groupConversation && <div className="channels-empty"><CircleAlert size={18} /><p>This group could not be prepared for configuration. Refresh the group list and try again.</p></div>}
      </div>
    </section>
  </section>;
}
