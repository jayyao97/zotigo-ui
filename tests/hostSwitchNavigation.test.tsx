import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";

import { createClientApi } from "../shared/clientApi";
import type { DesktopState, NavigationItem, SessionEventEnvelope, SessionQuery } from "../shared/clientTypes";
import { ClientContext } from "../src/ClientContext";
import type { DisplayItem } from "../shared/zotigod";
import { HostShell } from "../src/HostShell";
import { discardHostVolatileState } from "../src/App";

const emptyState: DesktopState = {
  projects: [], repositories: [], folders: [], workspaces: [], conversations: [], bindings: [],
  selectedProjectId: null, selectedWorkspaceId: null, selectedConversationId: null,
};

test("paginated activity never fetches the full session list and selection never refreshes the catalog", async () => {
  const restore = installDom();
  const callbacks = new Map<number, () => void>();
  const originalInterval = window.setInterval;
  window.setInterval = ((handler: () => void, ms: number) => { callbacks.set(ms, handler); return originalInterval(handler, ms); }) as typeof window.setInterval;
  const client = hostClient(false, {...emptyState, sessionQueryVersion: 1});
  let fullLists = 0, snapshots = 0;
  const getState = client.api.getDesktopState;
  client.api.getDesktopState = async () => { snapshots++; return getState(); };
  client.api.listSessions = async () => { fullLists++; return []; };
  const queries: SessionQuery[] = [];
  const now = new Date().toISOString();
  const conversation = {id:"own",title:"My completed task",project_id:null,workspace_id:null,created_at:now,updated_at:now};
  client.api.querySessions = async query => {
    queries.push(query);
    return {conversations: query.unread ? [conversation] : [], bindings: [], sessions: [{id:"own",created_at:now,state:"ended",live:false,working:false,read_state:{unread:true,version:1,read_version:0,completed_sequence:1}}]};
  };
  const root = await mountHostShell(client.api);
  try {
    assert.equal(fullLists,0,"initial closure must use discovered capabilities");
    await act(async () => click(document.querySelector(".recent-sessions-toggle")!)); await flush();
    assert.ok(queries.some(query => query.unread === true && query.channel === "pinned"));
    assert.ok(queries.some(query => query.unread === false && query.since));
    assert.match(document.querySelector(".recent-session-navigation")!.textContent!,/My completed task/);
    const before = snapshots;
    await act(async () => click(document.querySelector(".recent-session-navigation .sidebar-session > button")!)); await flush();
    assert.equal(snapshots,before);
    assert.ok(client.calls.some(call=>call.channel==="desktop:save-selection"));
    await act(async () => { callbacks.get(5000)?.(); }); await flush();
    assert.equal(fullLists,0,"periodic status poll must remain scoped");
    assert.match(document.querySelector(".recent-session-navigation")!.textContent!,/My completed task/);
  } finally { await act(async () => root.unmount()); window.setInterval=originalInterval; restore(); }
});

test("activity shows a running session from beyond the first page without fetching the next page", async () => {
  const restore = installDom();
  const client = hostClient(false, {...emptyState, sessionQueryVersion: 1});
  const listeners = new Set<(event: SessionEventEnvelope) => void>();
  client.api.onSessionEvent = fn => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  client.api.subscribeSessionEvents = async () => {};
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const conversations = Array.from({length: 21}, (_, i) => {
    const time = new Date(date.getTime() - i * 60000).toISOString();
    return {id: String(i), title: `Task ${i}`, created_at: time, updated_at: time, project_id: null, workspace_id: null};
  });
  let release!: () => void;
  const slowLookup = new Promise<void>(resolve => {release = resolve;});
  const queries: SessionQuery[] = [];
  client.api.querySessions = async query => {
    queries.push(query);
    if (query.ids?.includes("20")) await slowLookup;
    if (query.ids?.includes("extra")) throw new Error("active lookup failed");
    const rows = query.ids ? conversations.filter(row => query.ids!.includes(row.id)) :
      query.unread === false ? conversations.slice(0, 20) : [];
    return {
      conversations: rows,
      bindings: rows.map(row => ({conversation_id: row.id, daemon_session_id: row.id, created_at: row.created_at})),
      sessions: rows.map(row => ({id: row.id, created_at: row.created_at, state: "running", working: row.id === "20", live: true})),
      nextCursor: query.unread === false ? "page-2" : undefined,
    };
  };
  const root = await mountHostShell(client.api);
  try {
    await act(async () => click(document.querySelector(".recent-sessions-toggle")!));
    await act(async () => {
      for (const listener of listeners) listener({session_id: null, event: {type: "activity", revision: 1, active: {"20": "running"}}});
    });
    // Other sessions may start and finish while the remote ID lookup is in flight.
    await act(async () => {
      for (const listener of listeners) listener({session_id: null, event: {type: "activity", revision: 2, active: {"20": "running", extra: "running"}}});
    });
    await act(async () => release());
    await flush();
    assert.equal(queries.filter(query => query.ids?.includes("20")).length, 1);
    assert.match(document.querySelector(".recent-session-navigation [role=alert]")?.textContent ?? "", /active lookup failed/);
    const rows = () => document.querySelectorAll(".recent-session-navigation .sidebar-session");
    assert.equal(rows().length, 20);
    assert.equal(rows()[0].querySelector("button")?.title, "Task 20");
    assert.ok(rows()[0].querySelector(".sidebar-session-spinner"));
    assert.ok(queries.some(query => query.ids?.includes("20") && query.channel === "pinned"));
    assert.ok(!queries.some(query => query.cursor));
    assert.ok(document.querySelector(".recent-session-navigation > .recent-session-more"), "the chronological cursor belongs to the list, not a date group");
    await act(async () => {
      for (const listener of listeners) listener({session_id: null, event: {type: "activity", revision: 3, active: {}}});
    });
    assert.equal(document.querySelector(".recent-session-navigation [role=alert]"), null);
    assert.equal(rows()[0].querySelector("button")?.title, "Task 0");
    assert.equal(document.querySelector(".recent-session-navigation .sidebar-session-spinner"), null);
  } finally { await act(async () => root.unmount()); restore(); }
});

test("background completion removes the sidebar spinner without opening the session", async () => {
  const restore = installDom();
  const now = new Date().toISOString();
  const client = hostClient(false, {...emptyState, sessionQueryVersion: 1});
  const listeners = new Set<(event: SessionEventEnvelope) => void>();
  client.api.onSessionEvent = fn => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  client.api.subscribeSessionEvents = async () => {};
  client.api.querySessions = async query => query.ungrouped ? {
    conversations: [{id:"background", title:"Background investigation", project_id:null, workspace_id:null, created_at:now, updated_at:now}],
    bindings: [{conversation_id:"background",daemon_session_id:"background",state:"running",created_at:now}],
    sessions: [{id:"background", state:"running", live:true, working:true, created_at:now}],
  } : {conversations:[], bindings:[], sessions:[]};
  const root = await mountHostShell(client.api);
  try {
    assert.ok(document.querySelector(".sidebar-session-spinner"));
    await act(async () => {
      for (const listener of listeners) listener({session_id:null, event:{type:"activity",revision:2,active:{}}});
    });
    assert.match(document.querySelector(".ungrouped-section")!.textContent!, /Background investigation/);
    assert.equal(document.querySelector(".sidebar-session-spinner"), null);
    assert.ok(!client.calls.some(call => call.channel === "sessions:list-items"));
  } finally { await act(async () => root.unmount()); restore(); }
});

test("idle detail polling recovers profile changes without a body stream or new completion", async () => {
  const restore = installDom();
  const now = new Date().toISOString();
  const state = { ...emptyState, selectedConversationId: "idle",
    conversations: [{ id: "idle", title: "Idle chat", project_id: null, workspace_id: null, created_at: now, updated_at: now }],
    bindings: [{ conversation_id: "idle", daemon_session_id: "idle", state: "running" as const, created_at: now }],
  };
  const client = hostClient(false, state);
  const listeners = new Set<(event: SessionEventEnvelope) => void>();
  const subscriptions: Array<string | null> = [];
  client.api.onSessionEvent = fn => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  client.api.subscribeSessionEvents = async id => { subscriptions.push(id); };
  const items: DisplayItem[] = [{ id: "prompt", sequence: 1, type: "user_message", created_at: now, content: [{ type: "text", text: "hello" }] }];
  client.api.getSession = async () => ({ id: "idle", created_at: now, state: "running", working: false, live: true,
    latest_item_sequence: items.at(-1)!.sequence, read_state: { completed_sequence: 0, unread: false, version: 0, read_version: 0 } });
  const requests: Array<number | undefined> = [];
  client.api.listSessionItems = async (_id, query) => {
    requests.push(query?.after);
    return { items: items.filter(item => item.sequence > (query?.after ?? 0)), next_cursor: "", prev_cursor: "", has_more: false };
  };
  client.api.listQueuedInputs = async () => [];
  const originalInterval = window.setInterval;
  let poll: (() => void) | undefined;
  window.setInterval = ((handler: () => void, ms: number) => {
    if (ms === 5000) poll = handler;
    return originalInterval(handler, ms);
  }) as typeof window.setInterval;
  const root = await mountHostShell(client.api);
  try {
    await act(async () => {
      for (const listener of listeners) listener({session_id:null, event:{type:"activity",revision:0,active:{}}});
    });
    await flush();
    assert.ok(poll);
    const before = requests.length;
    await act(async () => poll!()); await flush();
    assert.equal(requests.length, before, "unchanged idle history shouldn't poll body pages");
    items.push({id:"profile",sequence:4,type:"profile_changed",profile:{from:"old",to:"new-profile"},created_at:now});
    await act(async () => poll!()); await flush();
    assert.equal(requests.at(-1), 1);
    assert.match(document.body.textContent!, /new-profile/);
    assert.deepEqual(subscriptions,[null]);
  } finally { await act(async () => root.unmount()); window.setInterval = originalInterval; restore(); }
});

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperties(dom.window.HTMLElement.prototype, {
    attachEvent: { configurable: true, value() {} },
    detachEvent: { configurable: true, value() {} },
    scrollTo: { configurable: true, value() {} },
  });
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const replacements = {
    window: dom.window,
    Window: dom.window.Window,
    document: dom.window.document,
    Node: dom.window.Node,
    Event: dom.window.Event,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: TestResizeObserver,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.fromEntries(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  }
  return () => {
    // Per-host state outlives an App by design; each test starts from a fresh process view.
    discardHostVolatileState();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  };
}

function hostClient(failDev = false, initialState = emptyState, sync?: () => Promise<DesktopState>) {
  let state = initialState;
  let activeHost = "local";
  const calls: Array<{ host: string; channel: string; args: unknown[] }> = [];
  const api = createClientApi({
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
    invoke: async <T,>(channel: string, ...args: unknown[]) => {
      calls.push({ host: activeHost, channel, args });
      if (channel === "hosts:list") return [
        { id: "local", name: "Local", baseUrl: "http://127.0.0.1:8766" },
        { id: "dev", name: "dev", baseUrl: "http://dev:8766" },
      ] as T;
      if (channel === "hosts:test") {
        if (failDev && args[0] === "dev") throw new Error("unreachable");
        return undefined as T;
      }
      if (channel === "hosts:activate") {
        activeHost = String(args[0]);
        return undefined as T;
      }
      if (channel === "daemon:get-config") return { baseUrl: "http://127.0.0.1:8766", token: "" } as T;
      if (channel === "desktop:get-state") return state as T;
      if (channel === "desktop:sync-state" && sync) { state = await sync(); return state as T; }
      if (channel === "desktop:set-navigation-pinned") {
        const item = args[0] as NavigationItem;
        const pins = state.pinnedItems ?? [];
        state = { ...state, pinnedItems: args[1] ? [...pins, item] : pins.filter((pin) => pin.kind !== item.kind || pin.id !== item.id) };
        return state as T;
      }
      if (channel === "desktop:reorder-pinned-items") {
        state = { ...state, pinnedItems: args[0] as NavigationItem[] };
        return state as T;
      }
      if (channel === "desktop:save-selection") {
        const next = args[0] as {projectId: string | null; workspaceId: string | null; sessionId: string | null};
        state = {...state, selectedProjectId: next.projectId, selectedWorkspaceId: next.workspaceId, selectedConversationId: next.sessionId};
        return undefined as T;
      }
      if (channel === "desktop:select-project") {
        state = { ...state, selectedProjectId: args[0] as string | null, selectedWorkspaceId: null };
        return state as T;
      }
      if (channel === "desktop:select-conversation") {
        state = { ...state, selectedConversationId: args[0] as string | null };
        return state as T;
      }
      if (channel === "sessions:list") return [] as T;
      if (channel === "daemon:get-profiles") return { default_profile: "", profiles: [] } as T;
      if (channel === "daemon:get-agents") return { default_agent: "zotigo", agents: [] } as T;
      if (channel === "sessions:unsubscribe-events" || channel === "files:unsubscribe-events") return undefined as T;
      throw new Error(`Unexpected operation: ${channel}`);
    },
  });
  return { api, calls, activeHost: () => activeHost };
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function click(element: Element) {
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

async function mountHostShell(api: ReturnType<typeof hostClient>["api"]) {
  const root = createRoot(document.querySelector("#root")!);
  await act(async () => root.render(
    <ClientContext.Provider value={{ api, kind: "desktop" }}><HostShell /></ClientContext.Provider>,
  ));
  await flush();
  return root;
}

async function chooseDevHost() {
  await act(async () => click(document.querySelector('[aria-label="Switch host"]')!));
  const dev = [...document.querySelectorAll<HTMLButtonElement>(".host-menu-popover button")]
    .find((button) => button.textContent?.includes("dev"));
  assert.ok(dev);
  await act(async () => click(dev));
  await flush();
}

for (const override of [false, true]) test(`new sessions default to full access and respect explicit auto selection (${override})`, async () => {
  const restore = installDom();
  const client = hostClient();
  let submitted: Parameters<typeof client.api.createConversation>[0] | undefined;
  client.api.createConversation = async input => { submitted = input; return { state: emptyState, session: { id: "new", state: "created", live: true, working: false, created_at: "2026-01-01T00:00:00Z" } }; };
  client.api.sendConversationMessage = async () => ({ command: { id: "cmd", sequence: 1, type: "message", created_at: "2026-01-01T00:00:00Z" } });
  const root = await mountHostShell(client.api);
  try {
    assert.equal(document.querySelector(".approval-policy-trigger")?.textContent, "Full access");
    if (override) {
      await act(async () => click(document.querySelector(".approval-policy-trigger")!));
      const auto = [...document.querySelectorAll(".approval-policy-menu button")].find(button => button.querySelector("strong")?.textContent === "Auto");
      assert.ok(auto);
      await act(async () => click(auto));
    }
    const editor = EditorView.findFromDOM(document.querySelector(".cm-content")!)!;
    await act(async () => editor.dispatch({ changes: { from: 0, insert: "hello" } }));
    await act(async () => document.querySelector("form.new-chat-composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(submitted);
    assert.equal(submitted.approvalPolicy, override ? "auto" : "bypass_permissions");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

for (const timelineHasPrompt of [false, true]) test(`a new session appears in navigation before its first message is delivered (timeline prompt: ${timelineHasPrompt})`, async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const project = { id: "project", name: "Project", created_at: time, updated_at: time };
  const workspace = { id: "workspace", project_id: "project", title: "Workspace", root_path: "/workspace", status: "ready" as const, created_at: time, updated_at: time };
  const initial: DesktopState = { ...emptyState, projects: [project], workspaces: [workspace], selectedProjectId: "project", selectedWorkspaceId: "workspace" };
  const client = hostClient(false, initial);
  const session = { id: "new-session", state: "created" as const, live: true, working: false, created_at: time };
  const created: DesktopState = { ...initial, selectedConversationId: session.id,
    conversations: [{ id: session.id, project_id: "project", workspace_id: "workspace", title: "hello", created_at: time, updated_at: time }],
    bindings: [{ conversation_id: session.id, daemon_session_id: session.id, created_at: time }] };
  client.api.createConversation = async () => ({ state: created, session });
  let sent: Parameters<typeof client.api.sendConversationMessage>[0] | undefined;
  let deliver!: () => void;
  client.api.sendConversationMessage = input => { sent = input; return new Promise(resolve => { deliver = () => resolve({ session, command: { id: "cmd", sequence: 1, type: "message", created_at: time } }); }); };
  client.api.getSession = async () => session;
  // The daemon may already show the accepted prompt, under its client message id, before the send request returns.
  client.api.listSessionItems = async () => ({ items: timelineHasPrompt && sent?.clientMessageId
    ? [{ id: sent.clientMessageId, sequence: 1, type: "user_message", created_at: time, content: [{ type: "text", text: "hello" }] }] : [],
  next_cursor: "", prev_cursor: "", has_more: false });
  client.api.subscribeSessionEvents = async () => {};
  client.api.listQueuedInputs = async () => [];
  const root = await mountHostShell(client.api);
  const prompts = () => [...document.querySelectorAll(".conversation-body .message-row.user")].filter(row => row.textContent?.includes("hello")).length;
  const body = () => document.querySelector(".conversation-body")?.textContent ?? "";
  try {
    const editor = EditorView.findFromDOM(document.querySelector(".cm-content")!)!;
    await act(async () => editor.dispatch({ changes: { from: 0, insert: "hello" } }));
    await act(async () => document.querySelector("form.new-chat-composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    assert.equal(sent?.conversationId, session.id, "the first message targets the created session");
    assert.ok(document.querySelector(`[data-workspace-id="workspace"] [data-session-id="${session.id}"]`), "navigation shows the session while delivery is pending");
    assert.equal(prompts(), 1, "the submitted prompt is shown exactly once");
    assert.doesNotMatch(body(), /No display items|Loading display history/, "the pending prompt replaces the empty timeline note");
    await act(async () => deliver());
    await flush();
    assert.ok(document.querySelector(`[data-session-id="${session.id}"]`));
    assert.equal(prompts(), 1, "the delivered prompt stays visible until the timeline shows it");
    assert.doesNotMatch(body(), /Sending/);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

for (const stage of ["rejected", "create", "send"] as const) test(`a failed new session ${stage} keeps the prompt recoverable in the right draft`, async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const project = { id: "project", name: "Project", created_at: time, updated_at: time };
  const workspace = { id: "workspace", project_id: "project", title: "Workspace", root_path: "/workspace", status: "ready" as const, created_at: time, updated_at: time };
  const initial: DesktopState = { ...emptyState, projects: [project], workspaces: [workspace], selectedProjectId: "project", selectedWorkspaceId: "workspace" };
  const client = hostClient(false, initial);
  const session = { id: "new-session", state: "created" as const, live: true, working: false, created_at: time };
  const created: DesktopState = { ...initial, selectedConversationId: session.id,
    conversations: [{ id: session.id, project_id: "project", workspace_id: "workspace", title: "hello", created_at: time, updated_at: time }],
    bindings: [{ conversation_id: session.id, daemon_session_id: session.id, created_at: time }] };
  client.api.createConversation = async () => stage === "send"
    ? { state: created, session }
    : { state: initial, error: "create exploded", deliveryState: stage === "rejected" ? "rejected" : undefined };
  let sent = false;
  client.api.sendConversationMessage = async () => { sent = true; return { error: "send exploded" }; };
  client.api.listQueuedInputs = async () => [];
  client.api.getSession = async () => session;
  client.api.listSessionItems = async () => ({ items: [], next_cursor: "", prev_cursor: "", has_more: false });
  client.api.subscribeSessionEvents = async () => {};
  const root = await mountHostShell(client.api);
  try {
    const editor = EditorView.findFromDOM(document.querySelector(".cm-content")!)!;
    await act(async () => editor.dispatch({ changes: { from: 0, insert: "hello" } }));
    await act(async () => document.querySelector("form.new-chat-composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    assert.equal(sent, stage === "send");
    const body = document.querySelector(".conversation-body")?.textContent ?? "";
    assert.match(body, /hello/, "the failed prompt stays visible");
    // Only an uncreated session can leave the user unsure whether creation happened.
    assert.equal(body.includes("creation may have succeeded"), stage === "create");
    assert.match(document.body.textContent ?? "", stage === "send" ? /send exploded/ : /create exploded/);
    assert.equal(document.querySelector(`[data-session-id="${session.id}"]`) !== null, stage === "send");
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".conversation-body button")];
    const restoreButton = buttons.find(button => /Restore/.test(button.textContent ?? ""));
    if (stage === "send") {
      // The message may have arrived, so only a retry under the same message id, or letting go, is offered.
      assert.ok(buttons.some(button => /Retry/.test(button.textContent ?? "")));
      assert.equal(restoreButton, undefined);
      const dismiss = buttons.find(button => /Dismiss/.test(button.textContent ?? ""));
      assert.ok(dismiss);
      await act(async () => click(dismiss));
      await flush();
      assert.doesNotMatch(document.querySelector(".conversation-body")?.textContent ?? "", /hello/);
      assert.doesNotMatch(document.body.textContent ?? "", /send exploded/);
      return;
    }
    assert.ok(restoreButton, "the prompt can be restored");
    await act(async () => click(restoreButton));
    await flush();
    assert.match(EditorView.findFromDOM(document.querySelector(".cm-content")!)!.state.doc.toString(), /hello/, "the draft returns to the composer the user is looking at");
    assert.ok(document.querySelector("form.new-chat-composer"));
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("the side panel follows a conversation opened from Channels and hides on configuration pages", async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const project = { id: "project", name: "Project", created_at: time, updated_at: time };
  const workspace = { id: "workspace", project_id: "project", title: "Workspace", root_path: "/workspace", status: "ready" as const, created_at: time, updated_at: time };
  const state: DesktopState = { ...emptyState, projects: [project], workspaces: [workspace], selectedProjectId: "project", selectedWorkspaceId: "workspace", selectedConversationId: "session-1",
    conversations: [{ id: "session-1", project_id: "project", workspace_id: "workspace", title: "Investigate README", created_at: time, updated_at: time }],
    bindings: [{ conversation_id: "session-1", daemon_session_id: "session-1", created_at: time }] };
  const client = hostClient(false, state);
  const session = { id: "session-1", state: "ended" as const, live: false, working: false, created_at: time };
  client.api.getSession = async () => session;
  client.api.listSessionItems = async () => ({ items: [], next_cursor: "", prev_cursor: "", has_more: false });
  client.api.subscribeSessionEvents = async () => {};
  client.api.listQueuedInputs = async () => [];
  const base = { connection_id: "connection-1", chat_id: "chat", chat_type: "group", chat_name: "Group", session_strategy: "topic", enabled: true, allowed_sender_ids: [], observed_senders: [], agent: "zotigo", profile_name: "", model: "", reasoning_effort: "", agent_instructions_mode: "inherit", agent_instructions: "", approval_instructions_mode: "inherit", approval_instructions: "", last_activity_at: time, created_at: time, updated_at: time };
  client.api.listChannelConnections = async () => [{ id: "connection-1", provider: "feishu", name: "Bot", app_id: "app", has_secret: true, enabled: true, status: "running", allow_chat_ids: [], owner_sender_ids: [], agent_instructions: "", approval_instructions: "", review_all_tools: true, cot_available: true, progress_mode: "cot", created_at: time, updated_at: time }] as never;
  client.api.listChannelGroups = async () => [{ chat_id: "chat", name: "Group", available: true, conversation_id: "group", workspace_id: "workspace", enabled: true, allowed_sender_ids: [], session_strategy: "topic", agent: "zotigo", profile_name: "", model: "", reasoning_effort: "" }] as never;
  client.api.listChannelConversations = async () => [
    { ...base, id: "group", display_name: "Group", workspace_id: "workspace" },
    { ...base, id: "topic", root_id: "message-1", display_name: "Investigate README", session_id: "session-1" },
  ] as never;
  const root = await mountHostShell(client.api);
  const panelHidden = () => document.querySelector(".subagent-side-panel")!.hasAttribute("inert");
  try {
    await act(async () => click(document.querySelector('[aria-label="Toggle side panel"]')!));
    assert.equal(panelHidden(), false, "the side panel opens for a selected session");
    await act(async () => click(document.querySelector('[aria-label="Channels"]')!));
    await flush();
    assert.equal(panelHidden(), true, "Channels configuration has no side panel");
    const topic = [...document.querySelectorAll<HTMLButtonElement>(".channels-conversation-item > button")].find(button => button.textContent?.includes("Investigate README"));
    assert.ok(topic);
    await act(async () => click(topic));
    await flush();
    // Entering Channels closes the panel; the opened conversation can show it again.
    await act(async () => click(document.querySelector('[aria-label="Toggle side panel"]')!));
    assert.equal(panelHidden(), false, "a conversation opened from Channels can use the side panel");
    await act(async () => click(document.querySelector('[aria-label="Configure Group"]')!));
    await flush();
    assert.equal(panelHidden(), true, "returning to a Channels group hides the side panel");
    await act(async () => click(document.querySelector('[aria-label="Repository library"]')!));
    await flush();
    assert.equal(panelHidden(), true, "Repositories has no side panel");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

// Shared fixtures for first-message delivery of a new session.
function newSessionFixture(initial: DesktopState = emptyState) {
  const time = "2026-01-01T00:00:00Z";
  const client = hostClient(false, initial);
  const sessionFor = (id: string) => ({ id, state: "created" as const, live: true, working: false, created_at: time });
  const conversationFor = (id: string, title: string, workspaceId: string | null = initial.selectedWorkspaceId) =>
    ({ id, project_id: initial.selectedProjectId, workspace_id: workspaceId, title, created_at: time, updated_at: time });
  const items = new Map<string, DisplayItem[]>();
  const listeners = new Set<(event: SessionEventEnvelope) => void>();
  client.api.onSessionEvent = fn => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  client.api.subscribeSessionEvents = async () => {};
  client.api.getSession = async id => sessionFor(id);
  client.api.listSessionItems = async id => ({ items: items.get(id) ?? [], next_cursor: "", prev_cursor: "", has_more: false });
  client.api.listQueuedInputs = async () => [];
  const promptItem = (id: string): DisplayItem => ({ id, sequence: 1, type: "user_message", created_at: time, content: [{ type: "text", text: "hello" }] });
  const emitItem = async (sessionId: string, item: DisplayItem) => {
    items.set(sessionId, [...(items.get(sessionId) ?? []), item]);
    await act(async () => { for (const listener of listeners) listener({ session_id: sessionId, event: { type: "item", item } }); });
    await flush();
  };
  const command = (id: string) => ({ id, sequence: 1, type: "message" as const, created_at: time });
  const submit = async () => {
    const editor = EditorView.findFromDOM(document.querySelector(".cm-content")!)!;
    await act(async () => editor.dispatch({ changes: { from: 0, insert: "hello" } }));
    await act(async () => document.querySelector("form.new-chat-composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
  };
  const prompts = () => [...document.querySelectorAll(".conversation-body .message-row.user")].filter(row => row.textContent?.includes("hello")).length;
  const body = () => document.querySelector(".conversation-body")?.textContent ?? "";
  const composer = () => EditorView.findFromDOM(document.querySelector(".cm-content")!)!.state.doc.toString();
  const buttonIn = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>(".conversation-body button")].find(button => label.test(button.textContent ?? ""));
  const openSession = async (id: string) => {
    const row = document.querySelector(`[data-session-id="${id}"] button`);
    assert.ok(row, `navigation row for ${id}`);
    await act(async () => click(row));
    await flush();
  };
  return { time, client, sessionFor, conversationFor, promptItem, emitItem, command, submit, prompts, body, composer, buttonIn, openSession };
}

async function chooseHost(name: string) {
  await act(async () => click(document.querySelector('[aria-label="Switch host"]')!));
  const host = [...document.querySelectorAll<HTMLButtonElement>(".host-menu-popover button")].find((button) => button.textContent?.includes(name));
  assert.ok(host);
  await act(async () => click(host));
  await flush();
}

test("a first message interrupted by a host switch is never sent elsewhere and is recoverable on its host", async () => {
  const restore = installDom();
  const fixture = newSessionFixture();
  const { client } = fixture;
  const session = fixture.sessionFor("dev-session");
  let devState: DesktopState | null = null;
  let releaseCreate!: () => void;
  const createdOn: string[] = [];
  client.api.createConversation = async () => {
    createdOn.push(client.activeHost());
    await new Promise<void>(resolve => { releaseCreate = resolve; });
    devState = { ...emptyState, selectedConversationId: session.id, conversations: [fixture.conversationFor(session.id, "hello", null)],
      bindings: [{ conversation_id: session.id, daemon_session_id: session.id, created_at: fixture.time }] };
    return { state: devState, session };
  };
  // Remounting on dev must see the session the delayed create made there.
  const hostState = () => client.activeHost() === "dev" && devState ? devState : emptyState;
  client.api.getDesktopState = async () => hostState();
  client.api.selectProject = async () => ({ ...hostState(), selectedConversationId: null });
  client.api.selectConversation = async id => ({ ...hostState(), selectedConversationId: id });
  const sends: Array<{ host: string; conversationId: string }> = [];
  client.api.sendConversationMessage = async input => { sends.push({ host: client.activeHost(), conversationId: input.conversationId }); return { command: fixture.command(input.clientMessageId!) }; };
  const root = await mountHostShell(client.api);
  try {
    await chooseHost("dev");
    await fixture.submit();
    assert.deepEqual(createdOn, ["dev"]);
    await chooseHost("Local");
    await act(async () => releaseCreate());
    await flush();
    assert.deepEqual(sends, [], "the first message is not sent after its host is gone");
    assert.equal(fixture.prompts(), 0, "the dev prompt does not appear on local");
    await chooseHost("dev");
    await fixture.openSession(session.id);
    assert.equal(fixture.prompts(), 1, "dev shows the unsent first message in its session");
    assert.match(fixture.body(), /host changed/i);
    const restoreButton = fixture.buttonIn(/Restore/);
    assert.ok(restoreButton);
    await act(async () => click(restoreButton));
    await flush();
    assert.match(fixture.composer(), /hello/, "the draft returns to the dev session's composer");
    assert.deepEqual(sends, []);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

for (const outcome of ["refused", "delivered"] as const) test(`a session selected while creation is pending keeps the first message bound to the created session (${outcome})`, async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const project = { id: "project", name: "Project", created_at: time, updated_at: time };
  const workspace = { id: "workspace", project_id: "project", title: "Workspace", root_path: "/workspace", status: "ready" as const, created_at: time, updated_at: time };
  const other = { id: "other", project_id: "project", workspace_id: "workspace", title: "Other session", created_at: time, updated_at: time };
  const initial: DesktopState = { ...emptyState, projects: [project], workspaces: [workspace], selectedProjectId: "project", selectedWorkspaceId: "workspace",
    conversations: [other], bindings: [{ conversation_id: other.id, daemon_session_id: other.id, created_at: time }] };
  const fixture = newSessionFixture(initial);
  const { client } = fixture;
  const session = fixture.sessionFor("created");
  let releaseCreate!: () => void;
  const created: DesktopState = { ...initial, conversations: [fixture.conversationFor(session.id, "hello"), other],
    bindings: [{ conversation_id: session.id, daemon_session_id: session.id, created_at: time }, ...initial.bindings] };
  let selected: string | null = null;
  let exists = false;
  const current = () => ({ ...(exists ? created : initial), selectedConversationId: selected });
  client.api.getDesktopState = async () => current();
  client.api.selectConversation = async id => { selected = id; return current(); };
  client.api.saveSelection = async next => { selected = next.sessionId; };
  client.api.createConversation = async () => {
    await new Promise<void>(resolve => { releaseCreate = resolve; });
    exists = true;
    // Web selection projection reports the user's later choice, not the created session.
    return { state: { ...created, selectedConversationId: selected }, session };
  };
  const sends: string[] = [];
  client.api.sendConversationMessage = async input => {
    sends.push(input.conversationId);
    return outcome === "refused" ? { error: "refused", deliveryState: "rejected" } : { command: fixture.command(input.clientMessageId!) };
  };
  const root = await mountHostShell(client.api);
  try {
    await fixture.submit();
    await fixture.openSession(other.id);
    await act(async () => releaseCreate());
    await flush();
    assert.deepEqual(sends, [session.id], "delivery targets the created session");
    assert.ok(document.querySelector(`[data-session-id="${other.id}"].selected`), "the user's navigation choice is kept");
    assert.equal(fixture.prompts(), 0, "the created session's prompt is not shown in another session");
    assert.doesNotMatch(document.body.textContent ?? "", /refused/, "the failure does not surface in another session");
    assert.equal(fixture.composer(), "");
    await fixture.openSession(session.id);
    if (outcome === "delivered") {
      // The confirmed prompt is left to history; a short tail page must not show it twice.
      assert.equal(fixture.prompts(), 0);
      return;
    }
    assert.equal(fixture.prompts(), 1);
    const restoreButton = fixture.buttonIn(/Restore/);
    assert.ok(restoreButton);
    await act(async () => click(restoreButton));
    await flush();
    assert.match(fixture.composer(), /hello/, "the draft returns only to the created session");
    await fixture.openSession(other.id);
    assert.equal(fixture.composer(), "");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

for (const order of ["event-first", "timeout-then-event", "timeout-then-retry"] as const) test(`a first message whose response times out reconciles by its message id (${order})`, async () => {
  const restore = installDom();
  const fixture = newSessionFixture();
  const { client } = fixture;
  const session = fixture.sessionFor("created");
  client.api.createConversation = async () => ({ session, state: { ...emptyState, selectedConversationId: session.id,
    conversations: [fixture.conversationFor(session.id, "hello", null)], bindings: [{ conversation_id: session.id, daemon_session_id: session.id, created_at: fixture.time }] } });
  const sends: string[] = [];
  const responses: Array<(result: Awaited<ReturnType<typeof client.api.sendConversationMessage>>) => void> = [];
  client.api.sendConversationMessage = input => { sends.push(input.clientMessageId!); return new Promise(resolve => { responses.push(resolve); }); };
  const timeout = { error: "request timed out", deliveryState: "unknown" as const };
  const root = await mountHostShell(client.api);
  try {
    await fixture.submit();
    assert.equal(sends.length, 1);
    const id = sends[0];
    if (order === "event-first") {
      await fixture.emitItem(session.id, fixture.promptItem(id));
      await act(async () => responses[0](timeout));
      await flush();
    } else if (order === "timeout-then-event") {
      await act(async () => responses[0](timeout));
      await flush();
      assert.match(document.body.textContent ?? "", /request timed out/);
      await fixture.emitItem(session.id, fixture.promptItem(id));
    } else {
      await act(async () => responses[0](timeout));
      await flush();
      assert.equal(fixture.prompts(), 1);
      const retry = fixture.buttonIn(/Retry/);
      assert.ok(retry, "an unconfirmed first message can be retried");
      assert.equal(fixture.buttonIn(/Restore/), undefined, "restoring would resend under a new id");
      await act(async () => click(retry));
      await flush();
      assert.deepEqual(sends, [id, id], "the retry reuses the message id so the daemon runs it once");
      await act(async () => responses[1]({ command: fixture.command(id) }));
      await fixture.emitItem(session.id, fixture.promptItem(id));
    }
    assert.equal(fixture.prompts(), 1, "the prompt is shown once");
    assert.doesNotMatch(fixture.body(), /Could not confirm|creation may have succeeded/);
    assert.doesNotMatch(document.body.textContent ?? "", /request timed out/, "a confirmed message leaves no failure banner");
    assert.equal(fixture.buttonIn(/Retry|Restore|Dismiss/), undefined);
    assert.ok(sends.every(value => value === id));
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("retry clears the previous send warning while pending and preserves a new failure", async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const state: DesktopState = { ...emptyState, selectedConversationId: "retry-test", conversations: [
    { id: "retry-test", project_id: null, workspace_id: null, title: "Retry session", created_at: time, updated_at: time },
  ] };
  const client = hostClient(false, state);
  let finish!: (result: Awaited<ReturnType<typeof client.api.sendConversationMessage>>) => void;
  client.api.sendConversationMessage = () => new Promise(resolve => { finish = resolve; });
  const root = await mountHostShell(client.api);
  const warning = () => document.querySelector(".assistant-note.warning")?.textContent;
  const retry = async () => {
    const button = [...document.querySelectorAll(".user-message-stack button")].find(button => button.textContent === "Retry");
    assert.ok(button);
    await act(async () => click(button));
    assert.equal(warning(), undefined, "previous warning clears before the network response");
  };
  try {
    const editor = EditorView.findFromDOM(document.querySelector(".cm-content")!)!;
    await act(async () => editor.dispatch({ changes: { from: 0, insert: "hello" } }));
    await act(async () => document.querySelector("form.composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => finish({ state, error: "message requires an online worker" }));
    assert.equal(warning(), "message requires an online worker");
    await retry();
    await act(async () => finish({ state, error: "connection interrupted" }));
    assert.equal(warning(), "connection interrupted");
    await retry();
    await act(async () => finish({ state, command: { id: "accepted", sequence: 1, type: "message", text: "hello", created_at: time } }));
    await flush();
    assert.equal(warning(), undefined, "successful retry must not retain the old warning");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("recent sessions toggles with the bell, keeps unread first, selects sessions and returns to the tree", async () => {
  const restore = installDom();
  const today = new Date().toISOString();
  const old = new Date(Date.now() - 20 * 86400000).toISOString();
  const state: DesktopState = { ...emptyState, conversations: [
    { id: "recent", title: "Recent read session", project_id: null, workspace_id: null, created_at: today, updated_at: today },
    { id: "unread", title: "Unread older session", project_id: null, workspace_id: null, created_at: old, updated_at: old },
    { id: "old", title: "Old read session", project_id: null, workspace_id: null, created_at: old, updated_at: old },
  ] };
  const client = hostClient(false, state);
  client.api.listSessions = async () => [{ id: "unread", created_at: old, state: "ended", live: false, working: false, read_state: { unread: true, version: 2, read_version: 1, completed_sequence: 3 } }];
  const root = await mountHostShell(client.api);
  try {
    const bell = document.querySelector<HTMLButtonElement>(".recent-sessions-toggle")!;
    assert.equal(bell.disabled, false);
    await act(async () => click(bell));
    assert.equal(bell.getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector(".projects-section"), null);
    assert.deepEqual([...document.querySelectorAll(".recent-session-navigation .sidebar-session-title")].map(node => node.textContent), ["Unread older session", "Recent read session"]);
    assert.ok(document.querySelector(".recent-session-navigation .sidebar-session-unread"));
    await act(async () => click(document.querySelectorAll(".recent-session-navigation .sidebar-session > button")[1]));
    assert.match(document.querySelector(".recent-session-navigation .sidebar-session.selected")?.textContent ?? "", /Recent read session/);
    await act(async () => click(bell));
    assert.ok(document.querySelector(".projects-section"));
    assert.ok(document.querySelector(".ungrouped-section")?.textContent?.includes("Old read session"));
    await act(async () => click(bell));
    await act(async () => click(document.querySelector('.utility-nav [aria-label="Home"]')!));
    assert.equal(bell.getAttribute("aria-pressed"), "false");
    assert.ok(document.querySelector(".projects-section"));
  } finally { await act(async () => root.unmount()); restore(); }
});

test("sidebar sections collapse independently and ungrouped sessions exist without projects", async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const state: DesktopState = {
    ...emptyState,
    conversations: [{ id: "loose", project_id: null, workspace_id: null, title: "Loose session", created_at: time, updated_at: time }],
  };
  const client = hostClient(false, state);
  let root = await mountHostShell(client.api);
  try {
    assert.ok(document.querySelector(".ungrouped-section")?.textContent?.includes("Loose session"));
    for (const name of ["pinned", "projects", "ungrouped"]) {
      const button = document.querySelector<HTMLButtonElement>(`.${name}-section .sidebar-section-toggle`)!;
      assert.equal(button.getAttribute("aria-expanded"), "true");
      await act(async () => click(button));
      assert.equal(button.getAttribute("aria-expanded"), "false");
      assert.equal(document.getElementById(button.getAttribute("aria-controls")!)?.hidden, true);
    }
    assert.ok(!document.querySelector(".ungrouped-section")?.textContent?.includes("Loose session"));
    assert.ok(document.querySelector('[aria-label="Add project"]'), "create action remains available while collapsed");
    await act(async () => root.unmount());
    root = await mountHostShell(client.api);
    assert.equal(document.querySelector('.ungrouped-section button')?.getAttribute("aria-expanded"), "false");
    await act(async () => click(document.querySelector('.ungrouped-section button')!));
    assert.ok(document.querySelector(".ungrouped-section")?.textContent?.includes("Loose session"));
    assert.equal(document.querySelector('.projects-section .sidebar-section-toggle')?.getAttribute("aria-expanded"), "false");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("a late workspace save failure cannot undo a second selection of the same workspace", async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const client = hostClient(false, {
    ...emptyState,
    projects: [{ id: "p", name: "Project", created_at: time, updated_at: time }],
    workspaces: [{ id: "w", project_id: "p", title: "Workspace", root_path: "/tmp/test", status: "ready", created_at: time, updated_at: time }],
    conversations: [{ id: "s", project_id: "p", workspace_id: "w", title: "Session", created_at: time, updated_at: time }],
    selectedProjectId: "p", selectedWorkspaceId: "w", selectedConversationId: "s",
  });
  let finishProject: (() => void) | undefined;
  let rejectFirst: ((error: Error) => void) | undefined;
  client.api.saveSelection = async input => {
    if (!input.workspaceId) await new Promise<void>(resolve => { finishProject = resolve; });
    else if (!input.sessionId && !rejectFirst) await new Promise<void>((_, reject) => { rejectFirst = reject; });
  };
  const root = await mountHostShell(client.api);
  try {
    const workspace = () => document.querySelector('.workspace-row-actions button:last-child')!;
    await act(async () => click(workspace()));
    assert.ok(rejectFirst);
    await act(async () => click(document.querySelector('[data-session-id="s"] > button')!));
    await act(async () => click(workspace()));
    await act(async () => rejectFirst!(new Error("obsolete save failure")));
    assert.ok(document.querySelector(".workspace-row.selected"));
    assert.equal(document.querySelector(".sidebar-session.selected"), null);
    assert.ok(!document.body.textContent?.includes("obsolete save failure"));
    await act(async () => click(document.querySelector(".sidebar-new-session")!));
    assert.ok(finishProject);
    await act(async () => click(workspace()));
    await act(async () => finishProject!());
    assert.ok(document.querySelector(".workspace-row.selected"), "an earlier project selection must not clear the workspace");

  } finally { await act(async () => root.unmount()); restore(); }
});

test("pinned navigation moves whole subtrees without duplicate selected sessions and supports mixed dragging", async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const state: DesktopState = {
    ...emptyState,
    projects: [{ id: "p", name: "Project Alpha", created_at: time, updated_at: time }],
    workspaces: [{ id: "w", project_id: "p", title: "Workspace Beta", root_path: "/tmp/test", status: "ready", created_at: time, updated_at: time }],
    conversations: [
      { id: "s", project_id: "p", workspace_id: "w", title: "Pinned session", pinned_at: time, created_at: time, updated_at: time },
      { id: "t", project_id: "p", workspace_id: "w", title: "Nested session", created_at: time, updated_at: time },
    ],
    pinnedItems: [{ kind: "session", id: "s" }],
    selectedProjectId: "p", selectedWorkspaceId: "w", selectedConversationId: "s",
  };
  const client = hostClient(false, state);
  const root = await mountHostShell(client.api);
  try {
    const pins = () => document.querySelector('section[aria-label="Pinned"]')!;
    const projects = () => document.querySelector('section[aria-label="Projects"]')!;
    assert.equal(document.querySelectorAll(".sidebar-session.selected").length, 1);
    assert.ok(pins().textContent?.includes("Pinned session"));
    assert.ok(!projects().textContent?.includes("Pinned session"));
    async function menuAction(name: string, action: string) {
      await act(async () => click(document.querySelector(`[aria-label="More actions for ${name}"]`)!));
      const button = [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === action);
      assert.ok(button, action);
      await act(async () => click(button));
      await flush();
    }
    await menuAction("Workspace Beta", "Pin workspace");
    assert.ok(pins().textContent?.includes("Workspace Beta"));
    assert.ok(pins().textContent?.includes("Nested session"));
    assert.ok(!projects().textContent?.includes("Workspace Beta"));
    await menuAction("Project Alpha", "Pin project");
    assert.ok(pins().textContent?.includes("Project Alpha"));
    assert.ok(!projects().textContent?.includes("Project Alpha"));
    assert.equal(document.querySelectorAll('[aria-label="More actions for Workspace Beta"]').length, 1);
    // Drag the pinned project before the pinned workspace.
    const source = pins().querySelector(".project-row-shell")!;
    const target = pins().querySelector(".workspace-row-shell")!;
    const dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
    for (const [node, type] of [[source, "dragstart"], [target, "dragover"], [target, "drop"]] as const) {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { dataTransfer: { value: dataTransfer }, clientY: { value: -1 } });
      await act(async () => node.dispatchEvent(event));
    }
    await flush();
    assert.deepEqual(client.calls.find((call) => call.channel === "desktop:reorder-pinned-items")?.args[0], [
      { kind: "session", id: "s" }, { kind: "project", id: "p" }, { kind: "workspace", id: "w" },
    ]);
    await menuAction("Workspace Beta", "Unpin workspace");
    assert.ok(pins().querySelector(".project-group .workspace-group"));
    await menuAction("Project Alpha", "Unpin project");
    assert.ok(projects().textContent?.includes("Nested session"));
    assert.ok(!pins().textContent?.includes("Nested session"));
    assert.equal(document.querySelectorAll(".sidebar-session.selected").length, 1);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("close shortcut leaves a session with its draft intact, then confirms closing the main window", async () => {
  const restore = installDom();
  const time = "2026-01-01T00:00:00Z";
  const client = hostClient(false, { ...emptyState, selectedConversationId: "close-test", conversations: [
    { id: "close-test", project_id: null, workspace_id: null, title: "Draft session", created_at: time, updated_at: time },
  ] });
  let closes = 0, confirmations = 0, confirmed = false;
  client.api.closeWindow = async () => { closes++; };
  window.confirm = () => { confirmations++; return confirmed; };
  const root = await mountHostShell(client.api);
  const requestClose = async () => { await act(async () => { window.dispatchEvent(new Event("zotigo:close-request")); }); await flush(); };
  const editor = () => EditorView.findFromDOM(document.querySelector(".cm-content")!)!;
  try {
    await act(async () => editor().dispatch({ changes: { from: 0, insert: "Keep my session draft" } }));
    await requestClose();
    assert.equal(confirmations, 0);
    assert.equal(closes, 0);
    assert.equal(document.querySelectorAll(".sidebar-session.selected").length, 0);
    assert.equal(editor().state.doc.toString(), "");
    await act(async () => editor().dispatch({ changes: { from: 0, insert: "Keep my new-session draft" } }));
    await requestClose();
    assert.equal(confirmations, 1);
    assert.equal(closes, 0, "cancel must not close the window");
    confirmed = true;
    await requestClose();
    assert.equal(closes, 1);
    assert.equal(editor().state.doc.toString(), "Keep my new-session draft");
    await act(async () => click(document.querySelector(".sidebar-session button")!));
    await flush();
    assert.equal(editor().state.doc.toString(), "Keep my session draft");
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("a successful host switch opens New session without clearing unread state", async () => {
  const restore = installDom();
  try {
    const client = hostClient();
    const root = await mountHostShell(client.api);
    assert.ok(client.calls.some((call) => call.host === "local" && call.channel === "desktop:get-state"));
    assert.ok(!client.calls.some((call) => call.channel === "desktop:select-project"));

    await chooseDevHost();

    assert.equal(client.activeHost(), "dev");
    assert.ok(client.calls.some((call) => call.host === "dev" && call.channel === "desktop:select-project" && call.args[0] === null));
    assert.ok(!client.calls.some(call => call.channel === "sessions:set-read-state"), "opening New session must not acknowledge another session");
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("a failed host switch keeps the current host and its restored selection", async () => {
  const restore = installDom();
  try {
    const client = hostClient(true);
    const root = await mountHostShell(client.api);
    await chooseDevHost();

    assert.equal(client.activeHost(), "local");
    assert.ok(!client.calls.some((call) => call.channel === "desktop:select-project"));
    assert.equal(client.calls.filter((call) => call.channel === "desktop:get-state").length, 1);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("refreshing Codex in Settings updates the mounted composer without mismatching its selected model and effort", async () => {
  const restore = installDom();
  localStorage.setItem("zotigo.model-favorites.v1:local", JSON.stringify([{ agent: "codex", model: "model-b", reasoningEffort: "high" }]));
  const client = hostClient();
  const capabilities = { profiles: false, models: true, steering: true, approvals: false };
  let preparations = 0;
  let updatedCatalog = false;
  const api = { ...client.api,
    getAgents: async () => ({ default_agent: "codex" as const, agents: [{ id: "codex" as const, label: "Codex", availability: "installed" as const, capabilities }] }),
    prepareCodex: async () => {
      preparations++;
      return { id: "codex" as const, label: "Codex", availability: "available" as const, capabilities, models: [
        { id: "model-a", display_name: "Model A", is_default: true, supported_reasoning_efforts: ["medium"] },
        { id: "model-b", display_name: "Model B", is_default: false, supported_reasoning_efforts: ["high"] },
        ...(updatedCatalog ? [{ id: "model-c", display_name: "Model C", is_default: false, supported_reasoning_efforts: ["low"] }] : []),
      ] };
    },
  };
  const root = await mountHostShell(api);
  try {
    await act(async () => click(document.querySelector('.runtime-settings-trigger')!));
    await act(async () => click(document.querySelector('.runtime-favorite > button')!));
    assert.match(document.querySelector('.runtime-settings-trigger')!.textContent!, /Model B · high/);
    await act(async () => click(document.querySelector('[aria-label="Switch host"]')!));
    await act(async () => click([...document.querySelectorAll('.host-menu-popover button')].find((button) => button.textContent === 'Settings')!));
    await flush();
    assert.equal(document.querySelector("#favorite-models-heading"), null);
    await act(async () => click(document.querySelectorAll(".settings-nav-item")[1]));
    await flush();
    assert.ok(document.querySelector("#favorite-models-heading"));
    const beforeRefresh = preparations;
    updatedCatalog = true;
    await act(async () => click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Refresh models')!));
    await flush();
    assert.equal(preparations, beforeRefresh + 1);
    await act(async () => click(document.querySelector('.settings-back')!));
    assert.match(document.querySelector('.runtime-settings-trigger')!.textContent!, /Model B · high/);
    await act(async () => click(document.querySelector('.runtime-settings-trigger')!));
    await act(async () => click([...document.querySelectorAll('.runtime-settings-row')].find((button) => button.textContent === 'Custom')!));
    await act(async () => click(document.querySelector('[data-runtime-section="model"]')!));
    assert.match(document.querySelector('.runtime-settings-submenu')!.textContent!, /Model C/);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});


test("Sync lives in Settings, reports errors and refreshes the mounted sidebar after retry", async () => {
  const restore = installDom();
  let complete!: (state: DesktopState) => void;
  let attempts = 0;
  const client = hostClient(false, emptyState, async () => {
    if (++attempts === 1) throw new Error("Sync network failure");
    return new Promise<DesktopState>((resolve) => { complete = resolve; });
  });
  const root = await mountHostShell(client.api);
  try {
    assert.equal(document.querySelector('.utility-nav')?.textContent?.includes('Sync'), false);
    assert.ok(document.querySelector('.utility-nav [aria-label="Home"]'));
    assert.equal(document.querySelector('.sidebar-new-session')?.parentElement, document.querySelector('.sidebar'));
    assert.ok(document.querySelector('.utility-nav [aria-label="Channels"]'));
    const pinned = document.querySelector('[aria-label="Pinned"]')!;
    const projects = document.querySelector('[aria-label="Projects"]')!;
    assert.equal(pinned.parentElement, projects.parentElement);
    await act(async () => click(document.querySelector('[aria-label="Switch host"]')!));
    await act(async () => click(Array.from(document.querySelectorAll('.host-menu-popover button')).find((button) => button.textContent === 'Settings')!));
    const syncButton = () => Array.from(document.querySelectorAll('.settings-page button')).find((button) => /^(Sync|Syncing…)$/.test(button.textContent ?? '')) as HTMLButtonElement;
    await act(async () => click(syncButton()));
    assert.match(document.querySelector('.settings-page [role="alert"]')?.textContent ?? '', /Sync network failure/);
    await act(async () => click(syncButton()));
    assert.equal(syncButton().disabled, true);
    assert.equal((document.querySelector('[aria-label="Switch host"]') as HTMLButtonElement).disabled, true);
    const escape = (options: KeyboardEventInit = {}) => act(async () => {
      document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...options }));
    });
    const dialog = document.createElement("dialog");
    dialog.open = true;
    document.body.append(dialog);
    await escape();
    assert.ok(document.querySelector(".settings-page"));
    dialog.remove();
    await escape({ isComposing: true });
    assert.ok(document.querySelector(".settings-page"));
    // Escape returns to the mounted workbench while the sync continues.
    await escape();
    assert.equal(document.querySelector(".settings-page"), null);
    await act(async () => complete({ ...emptyState, projects: [{ id: 'synced-project', name: 'Synced project', created_at: '', updated_at: '' }] }));
    await flush();
    assert.ok(document.querySelector('[aria-label="Projects"]')?.textContent?.includes('Synced project'));
    assert.equal(client.calls.filter((call) => call.channel === 'desktop:sync-state').length, 2);
  } finally {
    await act(async () => root.unmount()); restore();
  }
});

test("switching back shows only that host's cached sidebar while its refresh is pending", async () => {
  const { discardHostVolatileState } = await import("../src/App");
  discardHostVolatileState();
  const restore = installDom();
  const base = hostClient();
  const time = "2026-01-01T00:00:00Z";
  const states = Object.fromEntries(["local", "dev"].map(host => [host, { ...emptyState,
    conversations: [{ id: `${host}-session`, project_id: null, workspace_id: null, title: `${host} private conversation`, created_at: time, updated_at: time }],
  }]));
  let pendingHost: string | undefined;
  let release: (() => void) | undefined;
  const load = async () => {
    const host = base.activeHost();
    if (host === pendingHost) await new Promise<void>(resolve => { release = resolve; });
    return states[host];
  };
  const api = { ...base.api, getDesktopState: load, selectProject: load,
    selectConversation: async (id: string | null) => ({ ...states[base.activeHost()], selectedConversationId: id }),
  };
  const root = await mountHostShell(api);
  const choose = async (name: string) => {
    await act(async () => click(document.querySelector('[aria-label="Switch host"]')!));
    const button = [...document.querySelectorAll<HTMLButtonElement>(".host-menu-popover button")].find(b => b.textContent?.includes(name));
    assert.ok(button); await act(async () => click(button)); await flush();
  };
  try {
    assert.match(document.body.textContent!, /local private conversation/);
    await choose("dev");
    assert.match(document.body.textContent!, /dev private conversation/);
    assert.doesNotMatch(document.body.textContent!, /local private conversation/);
    pendingHost = "local";
    await choose("Local");
    assert.ok(release, "refresh should be pending");
    assert.match(document.body.textContent!, /local private conversation/);
    assert.doesNotMatch(document.body.textContent!, /dev private conversation/);
    const cachedRow = [...document.querySelectorAll(".sidebar-session")].find(row => row.textContent?.includes("local private conversation"));
    assert.ok(cachedRow);
    await act(async () => click(cachedRow.querySelector("button")!)); await flush();
    assert.match(document.querySelector(".sidebar-session.selected")?.textContent ?? "", /local private conversation/);
    pendingHost = undefined;
    await act(async () => release?.()); await flush();
    assert.match(document.querySelector(".sidebar-session.selected")?.textContent ?? "", /local private conversation/, "late initial snapshot must not clear a newer selection");
  } finally {
    release?.();
    await act(async () => root.unmount());
    discardHostVolatileState(); restore();
  }
});

test("a session opened from Usage loads it, and a later sidebar choice wins over a slow load", async () => {
  const restore = installDom();
  // Revealing the opened session in the sidebar uses CSS.escape, which jsdom lacks.
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape: (value: string) => value } });
  const now = new Date().toISOString();
  const row = (id: string) => ({ id, title: `Session ${id}`, project_id: null, workspace_id: null, created_at: now, updated_at: now });
  const client = hostClient(false, { ...emptyState, sessionQueryVersion: 1, conversations: [row("b")], bindings: [{ conversation_id: "b", daemon_session_id: "b", created_at: now }] });
  const pending = new Map<string, () => void>();
  const failing = new Map<string, () => void>();
  client.api.querySessions = query => new Promise((resolve, reject) => {
    // Sidebar pages list b; a, c and d are only reachable by id and load slowly.
    const id = query.ids?.[0] ?? "b";
    const page = { conversations: [row(id)], bindings: [{ conversation_id: id, daemon_session_id: id, created_at: now }], sessions: [] };
    if (id === "b") resolve(page); else { pending.set(id, () => resolve(page)); failing.set(id, () => reject(new Error(`load ${id} failed`))); }
  });
  const totals = { total: 10, input: 10, cacheRead: 0, cacheWrite: 0, output: 0, cacheInput: 0, turns: 1 };
  client.api.getUsageActivity = async () => ({ supported: true, data: { trackingSince: now, range: totals, allTime: totals, byModel: [], days: [], peakDay: null, currentStreakDays: 0, longestStreakDays: 0 } });
  client.api.getUsageSessions = async () => ({ supported: true, data: { sessions: ["a", "c", "d", "a2"].map(id => ({ ...totals, sessionId: id, title: `Session ${id}`, availability: "available" as const, models: [], channelTurns: 0, lastCompletedAt: now })) } });
  const root = await mountHostShell(client.api);
  const openFromUsage = async (id: string) => {
    await act(async () => click(document.querySelector(".brand-button")!));
    await act(async () => click([...document.querySelectorAll(".host-menu-popover button")].at(-1)!));
    await act(async () => click([...document.querySelectorAll(".settings-nav-item")].find(button => button.textContent === "Usage")!));
    await flush();
    await act(async () => click([...document.querySelectorAll("button.usage-session-row")].find(button => button.textContent?.includes(`Session ${id}`))!));
    await flush();
  };
  const selected = () => document.querySelector(".sidebar-session.selected")?.textContent ?? "";
  try {
    await openFromUsage("a");
    assert.equal(document.querySelector(".settings-page"), null, "returns to the workbench");
    await act(async () => pending.get("a")!()); await flush();
    assert.match(selected(), /Session a/);

    await openFromUsage("c");
    await act(async () => click([...document.querySelectorAll(".sidebar-session > button")].find(button => button.textContent?.includes("Session b"))!));
    await flush();
    assert.match(selected(), /Session b/);
    await act(async () => pending.get("c")!()); await flush();
    assert.match(selected(), /Session b/, "the slow load must not take over the newer choice");

    // A late failure of a superseded load does not show its error on the newer choice.
    await openFromUsage("d");
    await act(async () => click([...document.querySelectorAll(".sidebar-session > button")].find(button => button.textContent?.includes("Session b"))!));
    await flush();
    await act(async () => failing.get("d")!()); await flush();
    assert.match(selected(), /Session b/);
    assert.doesNotMatch(document.body.textContent ?? "", /load d failed/);

    // A failure of the current load is still reported.
    await openFromUsage("a2");
    await act(async () => failing.get("a2")!()); await flush();
    assert.match(document.body.textContent ?? "", /load a2 failed/);
  } finally { await act(async () => root.unmount()); Reflect.deleteProperty(globalThis, "CSS"); restore(); }
});

test("the locate button reveals the selected session in the tree like a search result, without leaving it", async () => {
  const restore = installDom();
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape: (value: string) => value } });
  const time = new Date().toISOString();
  localStorage.setItem("zotigo:sidebar-section:ungrouped:collapsed", "true");
  const client = hostClient(false, {
    ...emptyState,
    conversations: [{ id: "loose", project_id: null, workspace_id: null, title: "Loose session", created_at: time, updated_at: time }],
  });
  const root = await mountHostShell(client.api);
  const locate = () => document.querySelector<HTMLButtonElement>(".brand-actions .locate-selection")!;
  const ungrouped = () => document.querySelector<HTMLButtonElement>(".ungrouped-section .sidebar-section-toggle")!;
  try {
    assert.equal(locate().disabled, true, "nothing to locate without a selection");
    // Select the session from the activity view, then return to the collapsed tree.
    await act(async () => click(document.querySelector(".recent-sessions-toggle")!));
    await act(async () => click(document.querySelector(".recent-session-navigation .sidebar-session > button")!));
    await flush();
    assert.equal(locate().disabled, false);
    const saves = client.calls.filter(call => call.channel === "desktop:save-selection").length;
    assert.equal(document.querySelector(".ungrouped-section"), null, "the activity view replaces the tree");

    await act(async () => click(locate()));
    await flush();
    // The tree replaces the activity view and the collapsed section opens at the selected row.
    assert.equal(document.querySelector(".recent-sessions-toggle")!.getAttribute("aria-pressed"), "false");
    assert.equal(ungrouped().getAttribute("aria-expanded"), "true");
    assert.match(document.querySelector(".ungrouped-section .sidebar-session.selected")?.textContent ?? "", /Loose session/);
    assert.equal(client.calls.filter(call => call.channel === "desktop:save-selection").length, saves, "locating does not reselect");
    // Collapsing again dismisses the reveal; locating once more reopens it.
    await act(async () => click(ungrouped()));
    assert.equal(ungrouped().getAttribute("aria-expanded"), "false");
    await act(async () => click(locate()));
    await flush();
    assert.equal(ungrouped().getAttribute("aria-expanded"), "true");
  } finally { await act(async () => root.unmount()); Reflect.deleteProperty(globalThis, "CSS"); restore(); }
});
