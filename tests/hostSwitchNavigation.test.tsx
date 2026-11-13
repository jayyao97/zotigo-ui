import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";

import { createClientApi } from "../shared/clientApi";
import type { DesktopState, NavigationItem } from "../shared/clientTypes";
import { ClientContext } from "../src/ClientContext";
import { HostShell } from "../src/HostShell";

const emptyState: DesktopState = {
  projects: [], repositories: [], folders: [], workspaces: [], conversations: [], bindings: [],
  selectedProjectId: null, selectedWorkspaceId: null, selectedConversationId: null,
};

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
  let submitted: Parameters<typeof client.api.createConversationWithSession>[0] | undefined;
  client.api.createConversationWithSession = async input => { submitted = input; return { state: emptyState }; };
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
    // Navigating back does not lose the completed sync or remount the workbench.
    await act(async () => click(document.querySelector('.settings-back')!));
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
