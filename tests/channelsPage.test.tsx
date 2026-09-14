import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";

import type { ChannelConnection, ChannelConversation, ChannelConversationInput, ChannelGroup } from "../shared/channels";
import type { ClientApi, DesktopProject, DesktopWorkspace } from "../shared/clientTypes";
import { ChannelsPage } from "../src/channels/ChannelsPage";
import { ClientContext } from "../src/ClientContext";

const project: DesktopProject = { id: "project-1", name: "Project One", created_at: "", updated_at: "" };
const workspace: DesktopWorkspace = { id: "workspace-1", project_id: project.id, title: "Workspace One", root_path: "/workspace", status: "ready", created_at: "", updated_at: "" };

function connection(id: string, name: string): ChannelConnection {
  return { id, provider: "feishu", name, app_id: `app-${id}`, has_secret: true, enabled: true, status: "running", allow_chat_ids: [], owner_sender_ids: ["owner-1"], agent_instructions: "", approval_instructions: "", review_all_tools: true, cot_available: true, progress_mode: "cot", created_at: "", updated_at: "" };
}

function conversation(values: Partial<ChannelConversation>): ChannelConversation {
  return { id: "conversation", connection_id: "connection-1", chat_id: "chat-connected", chat_type: "group", chat_name: "Connected group", display_name: "Connected group", enabled: false, allowed_sender_ids: ["owner-1"], observed_senders: [], agent_instructions_mode: "inherit", agent_instructions: "", approval_instructions_mode: "inherit", approval_instructions: "", last_activity_at: "2026-01-01T00:00:00Z", created_at: "", updated_at: "", ...values };
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

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function button(container: ParentNode, label: string) {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find((value) => value.textContent?.includes(label));
  assert.ok(result, `button containing ${label}`);
  return result;
}

test("channel navigation separates available groups from bound Project sessions", async () => {
  const restore = installDom();
  try {
    const connected = conversation({ id: "group-connected", workspace_id: workspace.id, enabled: true });
    const topic = conversation({ id: "topic-1", root_id: "message-1", display_name: "Investigate README", session_id: "session-1", enabled: true });
    const available = conversation({ id: "group-available", chat_id: "chat-available", chat_name: "Available group", display_name: "Available group" });
    let conversations = [connected, topic, available];
    const groups: ChannelGroup[] = [
      { chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] },
      { chat_id: available.chat_id, name: "Available group", available: true, conversation_id: available.id, enabled: false, allowed_sender_ids: [] },
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
      ["connection-1", { group: { chat_id: "chat-one", name: "First group", available: true, conversation_id: "group-one", enabled: false, allowed_sender_ids: [] } satisfies ChannelGroup, conversation: conversation({ id: "group-one", chat_id: "chat-one", chat_name: "First group" }) }],
      ["connection-2", { group: { chat_id: "chat-two", name: "Second group", available: true, conversation_id: "group-two", enabled: false, allowed_sender_ids: [] } satisfies ChannelGroup, conversation: conversation({ id: "group-two", connection_id: "connection-2", chat_id: "chat-two", chat_name: "Second group" }) }],
    ]);
    const api = {
      listChannelConnections: async () => connections,
      listChannelGroups: async (id: string) => [byConnection.get(id)!.group],
      listChannelConversations: async (id: string) => [byConnection.get(id)!.conversation],
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
      listChannelGroups: async () => [{ chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
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
      listChannelGroups: async () => [{ chat_id: connected.chat_id, name: "Connected group", available: true, conversation_id: connected.id, workspace_id: workspace.id, enabled: true, allowed_sender_ids: ["owner-1"] } satisfies ChannelGroup],
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
