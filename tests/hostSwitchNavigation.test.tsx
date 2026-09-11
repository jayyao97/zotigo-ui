import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { createClientApi } from "../shared/clientApi";
import type { DesktopState } from "../shared/clientTypes";
import { unreadSessionsStorageKey } from "../src/unreadSessions";
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
    disconnect() {}
  }
  const replacements = {
    window: dom.window,
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

function hostClient(failDev = false) {
  let activeHost = "local";
  const calls: Array<{ host: string; channel: string; args: unknown[] }> = [];
  const api = createClientApi({
    onSessionEvent: () => () => {},
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
      if (channel === "desktop:get-state") return emptyState as T;
      if (channel === "desktop:select-project") return emptyState as T;
      if (channel === "sessions:list") return [] as T;
      if (channel === "daemon:get-profiles") return { default_profile: "", profiles: [] } as T;
      if (channel === "daemon:get-agents") return { default_agent: "zotigo", agents: [] } as T;
      if (channel === "sessions:unsubscribe-events") return undefined as T;
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

test("a successful host switch opens New session without clearing unread state", async () => {
  const restore = installDom();
  try {
    const client = hostClient();
    localStorage.setItem(unreadSessionsStorageKey("dev"), JSON.stringify(["unread-dev-session"]));
    const root = await mountHostShell(client.api);
    assert.ok(client.calls.some((call) => call.host === "local" && call.channel === "desktop:get-state"));
    assert.ok(!client.calls.some((call) => call.channel === "desktop:select-project"));

    await chooseDevHost();

    assert.equal(client.activeHost(), "dev");
    assert.ok(client.calls.some((call) => call.host === "dev" && call.channel === "desktop:select-project" && call.args[0] === null));
    assert.equal(localStorage.getItem(unreadSessionsStorageKey("dev")), JSON.stringify(["unread-dev-session"]));
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
