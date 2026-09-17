import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";

import type { ChannelConnection, ChannelConnectionInput, ChannelConversation, ChannelConversationInput, ChannelGroup } from "../shared/channels";
import type { ClientApi, DesktopProject, DesktopWorkspace } from "../shared/clientTypes";
import type { AgentCatalogEntry, ZotigoSession } from "../shared/zotigod";
import { ChannelsPage } from "../src/channels/ChannelsPage";
import { ClientContext } from "../src/ClientContext";

const project: DesktopProject = { id: "project-1", name: "Project One", created_at: "", updated_at: "" };
const workspace: DesktopWorkspace = { id: "workspace-1", project_id: project.id, title: "Workspace One", root_path: "/workspace", status: "ready", created_at: "", updated_at: "" };
const groupRuntime = { session_strategy: "topic", agent: "zotigo", profile_name: "", model: "", reasoning_effort: "" } as const;

function connection(id: string, name: string): ChannelConnection {
  return { id, provider: "feishu", name, app_id: `app-${id}`, has_secret: true, enabled: true, status: "running", allow_chat_ids: [], owner_sender_ids: ["owner-1"], agent_instructions: "", approval_instructions: "", review_all_tools: true, cot_available: true, progress_mode: "cot", created_at: "", updated_at: "" };
}

function conversation(values: Partial<ChannelConversation>): ChannelConversation {
  return { id: "conversation", connection_id: "connection-1", chat_id: "chat-connected", chat_type: "group", chat_name: "Connected group", display_name: "Connected group", session_strategy: "topic", enabled: false, allowed_sender_ids: ["owner-1"], observed_senders: [], agent: "zotigo", profile_name: "", model: "", reasoning_effort: "", agent_instructions_mode: "inherit", agent_instructions: "", approval_instructions_mode: "inherit", approval_instructions: "", last_activity_at: "2026-01-01T00:00:00Z", created_at: "", updated_at: "", ...values };
}

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=navigation></div><div id=root></div></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const replacements = { window: dom.window, document: dom.window.document, Node: dom.window.Node, Event: dom.window.Event, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, navigator: dom.window.navigator, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  return () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  };
}

function click(element: Element) {
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function changeSelect(element: HTMLSelectElement, value: string) {
  element.value = value;
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function button(container: ParentNode, label: string) {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find((value) => value.textContent?.includes(label));
  assert.ok(result, `button containing ${label}`);
  return result;
}

test("connection Save follows and includes prompt settings", async () => {
  const restore = installDom();
  try {
    const configured = { ...connection("connection-1", "Bot One"), agent_instructions: "Use connection vocabulary.", approval_instructions: "Review connection actions." };
    let savedInput: ChannelConnectionInput | undefined;
    const api = {
      listChannelConnections: async () => [configured],
      listChannelGroups: async () => [],
      listChannelConversations: async () => [],
      updateChannelConnection: async (_id: string, input: ChannelConnectionInput) => {
        savedInput = input;
        return { ...configured, ...input };
      },
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[]} workspaces={[]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();

    const prompt = [...document.querySelectorAll("h2")].find((heading) => heading.textContent === "Prompt and approval")!;
    const actions = document.querySelector("#root .channels-form-actions")!;
    assert.ok(prompt.compareDocumentPosition(actions) & window.Node.DOCUMENT_POSITION_FOLLOWING);
    await act(async () => click(button(actions, "Save")));
    await flush();
    assert.equal(savedInput?.agent_instructions, "Use connection vocabulary.");
    assert.equal(savedInput?.approval_instructions, "Review connection actions.");
    assert.match(actions.textContent ?? "", /connection, prompt, and approval/);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("channel navigation separates available groups from bound Project sessions", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true });
    const topic = conversation({ id: "topic-1", root_id: "message-1", display_name: "Investigate README", session_id: "session-1", enabled: true });
    const available = conversation({ id: "group-available", chat_id: "chat-available", chat_name: "Available group", display_name: "Available group" });
    let conversations = [connected, topic, available];
    const groups: ChannelGroup[] = [
      { ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] },
      { ...groupRuntime, chat_id: available.chat_id, name: "Available group", available: true, conversation_id: available.id, enabled: false, allowed_sender_ids: [] },
    ];
    const opened: Array<[string, boolean | undefined]> = [];
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => groups,
      listChannelConversations: async () => conversations,
      updateChannelConversation: async (id: string, input: ChannelConversationInput) => {
        const current = conversations.find((value) => value.id === id)!;
        const saved = { ...current, ...input };
        conversations = conversations.map((value) => value.id === id ? saved : value);
        return saved;
      },
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async (id, leave) => { opened.push([id, leave]); }} /></ClientContext.Provider>));
    await flush();

    const navigation = document.querySelector("#navigation")!;
    assert.match(navigation.textContent ?? "", /Project One[\s\S]*Connected group[\s\S]*Investigate README/);
    assert.doesNotMatch(navigation.textContent ?? "", /Available group/);

    await act(async () => click(navigation.querySelector('[aria-label="Collapse Project One"]')!));
    assert.doesNotMatch(navigation.textContent ?? "", /Connected group|Investigate README/);
    await act(async () => click(navigation.querySelector('[aria-label="Expand Project One"]')!));
    await act(async () => click(navigation.querySelector('[aria-label="Collapse Connected group"]')!));
    assert.doesNotMatch(navigation.textContent ?? "", /Investigate README/);
    await act(async () => click(navigation.querySelector('[aria-label="Expand Connected group"]')!));
    assert.match(navigation.textContent ?? "", /Investigate README/);
    assert.ok(navigation.querySelector('[aria-label="Configure Connected group"]'));

    await act(async () => click(navigation.querySelector('[aria-label="Connect group"]')!));
    assert.match(navigation.textContent ?? "", /Available group/);

    const topicButton = navigation.querySelector(".channels-chat-conversations .sidebar-session > button")!;
    await act(async () => click(topicButton));
    await flush();
    assert.deepEqual(opened[0], ["session-1", undefined]);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible selectedSessionId="session-1" onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async (id, leave) => { opened.push([id, leave]); }} /></ClientContext.Provider>));
    assert.ok(navigation.querySelector(".channels-conversation-item.selected"));
    assert.equal(navigation.querySelector(".workspace-row.selected"), null);
    await act(async () => click(navigation.querySelector('[aria-label="Open in Sessions"]')!));
    await flush();
    assert.deepEqual(opened[1], ["session-1", true]);

    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} selectedSessionId="session-1" onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async (id, leave) => { opened.push([id, leave]); }} /></ClientContext.Provider>));
    await act(async () => click(navigation.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();
    await act(async () => click(button(document.querySelector("#root")!, "Disconnect")));
    await flush();
    assert.equal(navigation.querySelector('[aria-label="Collapse Project One"]'), null);
    assert.match(navigation.querySelector(".channels-available-groups")?.textContent ?? "", /Connected group/);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("switching bot connections replaces the previous group's navigation", async () => {
  const restore = installDom();
  try {
    const connections = [connection("connection-1", "Bot One"), connection("connection-2", "Bot Two")];
    const byConnection = new Map([
      ["connection-1", { group: { ...groupRuntime, chat_id: "chat-one", name: "First group", available: true, conversation_id: "group-one", enabled: false, allowed_sender_ids: [] } satisfies ChannelGroup, conversation: conversation({ id: "group-one", chat_id: "chat-one", chat_name: "First group" }) }],
      ["connection-2", { group: { ...groupRuntime, chat_id: "chat-two", name: "Second group", available: true, conversation_id: "group-two", enabled: false, allowed_sender_ids: [] } satisfies ChannelGroup, conversation: conversation({ id: "group-two", connection_id: "connection-2", chat_id: "chat-two", chat_name: "Second group" }) }],
    ]);
    const api = {
      listChannelConnections: async () => connections,
      listChannelGroups: async (id: string) => [byConnection.get(id)!.group],
      listChannelConversations: async (id?: string) => id
        ? [byConnection.get(id)!.conversation]
        : [...byConnection.values()].map((value) => value.conversation),
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[]} workspaces={[]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    const navigation = document.querySelector("#navigation")!;
    await act(async () => click(navigation.querySelector('[aria-label="Connect group"]')!));
    assert.match(navigation.textContent ?? "", /First group/);
    await act(async () => click(button(navigation, "Bot Two")));
    await flush();
    assert.doesNotMatch(navigation.textContent ?? "", /First group/);
    await act(async () => click(navigation.querySelector('[aria-label="Connect group"]')!));
    assert.match(navigation.textContent ?? "", /Second group/);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("new connection keeps the selected bot navigation and its sessions visible", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true });
    const topic = conversation({ id: "topic-1", root_id: "message-1", display_name: "Snapshot E2E", session_id: "session-1", enabled: true });
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected, topic],
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();

    const navigation = document.querySelector("#navigation")!;
    assert.match(navigation.textContent ?? "", /Bot One[\s\S]*Connected group[\s\S]*Snapshot E2E/);
    await act(async () => click(navigation.querySelector('[aria-label="New connection"]')!));
    assert.match(document.querySelector("#root")!.textContent ?? "", /New Feishu connection/);
    assert.match(navigation.textContent ?? "", /Bot One[\s\S]*Connected group[\s\S]*Snapshot E2E/);
    assert.equal(button(navigation, "Bot One").getAttribute("aria-pressed"), "true");

    await act(async () => click(button(navigation, "Bot One")));
    await flush();
    assert.match(document.querySelector("#root")!.textContent ?? "", /Bot One/);
    assert.doesNotMatch(document.querySelector("#root")!.textContent ?? "", /New Feishu connection/);
    assert.match(navigation.textContent ?? "", /Connected group[\s\S]*Snapshot E2E/);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("new connection survives the initial bot navigation load", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true });
    const topic = conversation({ id: "topic-1", root_id: "message-1", display_name: "Snapshot E2E", session_id: "session-1", enabled: true });
    let resolveConnections!: (values: ChannelConnection[]) => void;
    const pendingConnections = new Promise<ChannelConnection[]>((resolve) => { resolveConnections = resolve; });
    const api = {
      listChannelConnections: async () => pendingConnections,
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected, topic],
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));

    const navigation = document.querySelector("#navigation")!;
    await act(async () => click(navigation.querySelector('[aria-label="New connection"]')!));
    assert.match(document.querySelector("#root")!.textContent ?? "", /New Feishu connection/);
    await act(async () => { resolveConnections([connection("connection-1", "Bot One")]); await pendingConnections; });
    await flush();

    assert.match(document.querySelector("#root")!.textContent ?? "", /New Feishu connection/);
    assert.match(navigation.textContent ?? "", /Bot One[\s\S]*Connected group[\s\S]*Snapshot E2E/);
    assert.equal(button(navigation, "Bot One").getAttribute("aria-pressed"), "true");
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("group sender policy loads Feishu members and can allow the whole group", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true, sender_policy: "selected", allowed_sender_ids: ["owner-1"] });
    let savedInput: ChannelConversationInput | undefined;
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, sender_policy: "selected", allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected],
      listChannelGroupMembers: async () => [{ id: "owner-1", display_name: "Owner" }, { id: "member-2", display_name: "Member Two" }],
      getProfiles: async () => ({ default_profile: "default-profile", profiles: [{ name: "default-profile", provider: "test", model: "test-model" }] }),
      updateChannelConversation: async (_id: string, input: ChannelConversationInput) => {
        savedInput = input;
        return { ...connected, ...input };
      },
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();

    const policy = [...document.querySelectorAll<HTMLSelectElement>("#root select")].find((value) => value.textContent?.includes("All group members"))!;
    const members = [...document.querySelectorAll<HTMLElement>("#root .channels-member-option span")];
    assert.deepEqual(members.map((member) => member.textContent), ["Owner", "Member Two"]);
    await act(async () => changeSelect(policy, "all"));
    assert.equal(document.querySelector("#root .channels-member-picker"), null);
    await act(async () => click(button(document.querySelector("#root")!, "Save")));
    await flush();
    assert.equal(savedInput?.sender_policy, "all");
    assert.deepEqual(savedInput?.allowed_sender_ids, []);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("group settings persist the selected Codex model and reasoning effort", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true });
    let savedInput: ChannelConversationInput | undefined;
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected],
      getProfiles: async (rootPath: string) => {
        assert.equal(rootPath, workspace.root_path);
        return { default_profile: "default-profile", profiles: [{ name: "default-profile", provider: "test", model: "test-model" }] };
      },
      updateChannelConversation: async (_id: string, input: ChannelConversationInput) => {
        savedInput = input;
        return { ...connected, ...input };
      },
    } as unknown as ClientApi;
    const agents: AgentCatalogEntry[] = [
      { id: "zotigo", label: "Zotigo", availability: "available", capabilities: { profiles: true, models: false, steering: true, approvals: true } },
      { id: "codex", label: "Codex", availability: "installed", capabilities: { profiles: false, models: true, steering: true, approvals: true }, models: [{ id: "gpt-channel", display_name: "GPT Channel", is_default: true, supported_reasoning_efforts: ["medium", "high"] }] },
    ];
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} agents={agents} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();

    const runtimeTrigger = document.querySelector<HTMLButtonElement>('#root [aria-label^="Runtime settings:"]');
    assert.ok(runtimeTrigger);
    assert.match(runtimeTrigger.textContent ?? "", /Workspace default · default-profile/);
    await act(async () => click(runtimeTrigger));
    await act(async () => click(button(document.querySelector("#root")!, "Agent")));
    await act(async () => click(button(document.querySelector("#root")!, "Codex")));
    assert.match(runtimeTrigger.textContent ?? "", /GPT Channel · medium/);

    await act(async () => click(button(document.querySelector("#root")!, "Save")));
    await flush();
    assert.deepEqual(savedInput && {
      agent: savedInput.agent,
      profile_name: savedInput.profile_name,
      model: savedInput.model,
      reasoning_effort: savedInput.reasoning_effort,
    }, { agent: "codex", profile_name: "", model: "gpt-channel", reasoning_effort: "medium" });
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("group Save includes prompt overrides shown below workspace settings", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true, agent_instructions_mode: "replace", agent_instructions: "Use the current group vocabulary." });
    let savedInput: ChannelConversationInput | undefined;
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected],
      getProfiles: async () => ({ default_profile: "default-profile", profiles: [] }),
      updateChannelConversation: async (_id: string, input: ChannelConversationInput) => {
        savedInput = input;
        return { ...connected, ...input };
      },
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();

    await act(async () => click(button(document.querySelector("#root")!, "Save")));
    await flush();
    assert.equal(savedInput?.agent_instructions_mode, "replace");
    assert.equal(savedInput?.agent_instructions, "Use the current group vocabulary.");
    assert.match(document.querySelector("#root .channels-form-actions")?.textContent ?? "", /next turn/);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("group settings can bind one shared Session", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true });
    const sharedSession: ZotigoSession = { id: "session-shared", state: "running", live: true, working_directory: workspace.root_path, agent: "codex", model: "gpt-channel", reasoning_effort: "high", channel_tools_eligible: true, created_at: "", working: false };
    const boundSession: ZotigoSession = { ...sharedSession, id: "session-bound" };
    const archivedSession: ZotigoSession = { ...sharedSession, id: "session-archived", state: "offline" };
    const legacyCodexSession: ZotigoSession = { ...sharedSession, id: "session-legacy", channel_tools_eligible: false };
    const boundElsewhere = conversation({ id: "other-group", connection_id: "connection-2", chat_id: "other-chat", session_strategy: "shared", session_id: boundSession.id, workspace_id: workspace.id, enabled: true });
    let savedInput: ChannelConversationInput | undefined;
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected, boundElsewhere],
      getProfiles: async () => ({ default_profile: "default-profile", profiles: [] }),
      updateChannelConversation: async (_id: string, input: ChannelConversationInput) => {
        savedInput = input;
        return { ...connected, ...input };
      },
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} sessions={[sharedSession, boundSession, archivedSession, legacyCodexSession]} sessionCatalog={[{ id: sharedSession.id, project_id: project.id, workspace_id: workspace.id, title: "Investigate session labels", created_at: "", updated_at: "" }, { id: legacyCodexSession.id, project_id: project.id, workspace_id: workspace.id, title: "Legacy Codex", created_at: "", updated_at: "" }]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();

    const selects = [...document.querySelectorAll<HTMLSelectElement>("#root select")];
    const strategy = selects.find((value) => value.textContent?.includes("Shared Session in group"))!;
    await act(async () => changeSelect(strategy, "shared"));
	assert.match(document.querySelector("#root")!.textContent ?? "", /all replies stay in the main group/);
    const session = [...document.querySelectorAll<HTMLSelectElement>("#root select")].find((value) => value.textContent?.includes("session-shared"))!;
    assert.match(session.textContent ?? "", /Investigate session labels · session-shared · gpt-channel/);
    assert.doesNotMatch(session.textContent ?? "", /session-bound/);
    assert.doesNotMatch(session.textContent ?? "", /session-archived/);
    assert.doesNotMatch(session.textContent ?? "", /session-legacy/);
    await act(async () => changeSelect(session, sharedSession.id));
    await act(async () => click(button(document.querySelector("#root")!, "Save")));
    await flush();

    assert.deepEqual(savedInput && {
      strategy: savedInput.session_strategy,
      session: savedInput.session_id,
      agent: savedInput.agent,
      model: savedInput.model,
      effort: savedInput.reasoning_effort,
    }, { strategy: "shared", session: "session-shared", agent: "codex", model: "gpt-channel", effort: "high" });
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("unbinding a shared Session keeps its runtime available for the replacement Session", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true, session_strategy: "shared", session_id: "session-shared", agent: "codex", model: "gpt-channel", reasoning_effort: "high" });
    const sharedSession: ZotigoSession = { id: "session-shared", state: "running", live: true, working_directory: workspace.root_path, agent: "codex", model: "gpt-channel", reasoning_effort: "high", channel_tools_eligible: true, created_at: "", working: false };
    let savedInput: ChannelConversationInput | undefined;
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, session_strategy: "shared", session_id: sharedSession.id, agent: "codex", model: "gpt-channel", reasoning_effort: "high", chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected],
      getProfiles: async () => ({ default_profile: "default-profile", profiles: [] }),
      updateChannelConversation: async (_id: string, input: ChannelConversationInput) => {
        savedInput = input;
        return { ...connected, ...input };
      },
    } as unknown as ClientApi;
    const agents: AgentCatalogEntry[] = [
      { id: "codex", label: "Codex", availability: "installed", capabilities: { profiles: false, models: true, steering: true, approvals: true }, models: [{ id: "gpt-channel", display_name: "GPT Channel", is_default: true, supported_reasoning_efforts: ["medium", "high"] }] },
    ];
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} agents={agents} sessions={[sharedSession]} sessionCatalog={[{ id: sharedSession.id, project_id: project.id, workspace_id: workspace.id, title: "Existing shared Session", created_at: "", updated_at: "" }]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();

    const session = [...document.querySelectorAll<HTMLSelectElement>("#root select")].find((value) => value.textContent?.includes("Create on first @mention"))!;
    await act(async () => changeSelect(session, ""));
    const save = button(document.querySelector("#root")!, "Save");
    assert.equal(save.disabled, false);
    assert.match(document.querySelector<HTMLButtonElement>('#root [aria-label^="Runtime settings:"]')?.textContent ?? "", /GPT Channel · high/);

    await act(async () => click(save));
    await flush();
    assert.deepEqual(savedInput && {
      session: savedInput.session_id,
      agent: savedInput.agent,
      model: savedInput.model,
      effort: savedInput.reasoning_effort,
    }, { session: "", agent: "codex", model: "gpt-channel", effort: "high" });
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("topic-mode Feishu groups cannot select a shared Session", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", chat_mode: "topic", workspace_id: workspace.id, enabled: true });
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_mode: "topic", chat_id: connected.chat_id, name: "Topic group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected],
      getProfiles: async () => ({ default_profile: "default-profile", profiles: [] }),
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Topic group"]')!));
    await flush();

    const strategy = [...document.querySelectorAll<HTMLSelectElement>("#root select")].find((value) => value.textContent?.includes("Shared Session in group"));
    assert.ok(strategy);
    assert.equal(strategy.querySelector<HTMLOptionElement>('option[value="shared"]')?.disabled, true);
    assert.match(document.querySelector("#root")!.textContent ?? "", /Feishu topic groups use one Session per topic/);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("group settings report an older daemon that discards runtime selection", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: false });
    let authoritative = connected;
    const updates: ChannelConversationInput[] = [];
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: authoritative.enabled, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [authoritative],
      getProfiles: async () => ({ default_profile: "default-profile", profiles: [{ name: "default-profile", provider: "test", model: "test-model" }] }),
      updateChannelConversation: async (_id: string, input: ChannelConversationInput) => {
        updates.push(input);
        authoritative = { ...authoritative, ...input, agent: "zotigo", profile_name: "", model: "", reasoning_effort: "" };
        return authoritative;
      },
    } as unknown as ClientApi;
    const agents: AgentCatalogEntry[] = [
      { id: "zotigo", label: "Zotigo", availability: "available", capabilities: { profiles: true, models: false, steering: true, approvals: true } },
      { id: "codex", label: "Codex", availability: "installed", capabilities: { profiles: false, models: true, steering: true, approvals: true }, models: [{ id: "gpt-channel", display_name: "GPT Channel", is_default: true, supported_reasoning_efforts: ["medium"] }] },
    ];
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace]} agents={agents} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Connect group"]')!));
    await act(async () => click(button(document.querySelector("#navigation")!, "Connected group")));
    await flush();
    await act(async () => click(document.querySelector('#root [aria-label^="Runtime settings:"]')!));
    await act(async () => click(button(document.querySelector("#root")!, "Agent")));
    await act(async () => click(button(document.querySelector("#root")!, "Codex")));
    await act(async () => click(button(document.querySelector("#root")!, "Connect")));
    await flush();
    assert.match(document.querySelector('[role="status"]')?.textContent ?? "", /does not support Channel runtime selection/);
    assert.doesNotMatch(document.querySelector('[role="status"]')?.textContent ?? "", /Group connected/);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].enabled, true);
    assert.equal(updates[1].enabled, false);
    assert.equal(authoritative.enabled, false);
    await act(async () => click(button(document.querySelector("#navigation")!, "Bot One")));
    await flush();
    assert.equal(document.querySelector('[role="status"]'), null);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("switching workspaces clears stale profiles until the new catalog loads", async () => {
  const restore = installDom();
  try {
    const secondWorkspace: DesktopWorkspace = { ...workspace, id: "workspace-2", title: "Workspace Two", root_path: "/workspace-two" };
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, profile_name: "first-profile", enabled: true });
    let resolveSecond!: (value: { default_profile: string; profiles: Array<{ name: string; provider: string; model: string }> }) => void;
    const secondProfiles = new Promise<{ default_profile: string; profiles: Array<{ name: string; provider: string; model: string }> }>((resolve) => { resolveSecond = resolve; });
    const api = {
      listChannelConnections: async () => [connection("connection-1", "Bot One")],
      listChannelGroups: async () => [{ ...groupRuntime, profile_name: "first-profile", chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
      listChannelConversations: async () => [connected],
      getProfiles: async (rootPath: string) => rootPath === workspace.root_path
        ? { default_profile: "first-profile", profiles: [{ name: "first-profile", provider: "test", model: "first" }] }
        : secondProfiles,
    } as unknown as ClientApi;
    const root = createRoot(document.querySelector("#root")!);
    await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ChannelsPage hostName="Local" projects={[project]} workspaces={[workspace, secondWorkspace]} navigationRoot={document.querySelector("#navigation")!} navigationButtonRef={createRef<HTMLButtonElement>()} navigationOpen sessionVisible={false} onOpenNavigation={() => {}} onShowConfiguration={() => {}} onBack={() => {}} onOpenSession={async () => {}} /></ClientContext.Provider>));
    await flush();
    await act(async () => click(document.querySelector('[aria-label="Configure Connected group"]')!));
    await flush();
    const workspaceSelect = [...document.querySelectorAll<HTMLSelectElement>("#root select")].find((value) => value.textContent?.includes("Workspace Two"))!;
    await act(async () => changeSelect(workspaceSelect, secondWorkspace.id));
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>('#root [aria-label^="Runtime settings:"]')!;
    assert.match(trigger.textContent ?? "", /^Workspace default/);
    await act(async () => click(trigger));
    assert.equal(document.querySelector<HTMLButtonElement>('#root [data-runtime-section="profile"]')?.disabled, true);
    assert.equal(button(document.querySelector("#root")!, "Save").disabled, true);
    await act(async () => resolveSecond({ default_profile: "second-profile", profiles: [{ name: "second-profile", provider: "test", model: "second" }] }));
    await flush();
    assert.match(trigger.textContent ?? "", /Workspace default · second-profile/);
    assert.equal(document.querySelector<HTMLButtonElement>('#root [data-runtime-section="profile"]')?.disabled, false);
    await act(async () => root.unmount());
  } finally { restore(); }
});
