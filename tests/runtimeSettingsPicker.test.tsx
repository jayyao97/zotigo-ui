import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RuntimeSettingsPicker } from "../src/conversation/ConversationComposer";
import { useModelFavorites, type ModelFavorite } from "../src/modelFavorites";
import type { AgentKind } from "../shared/zotigod";

const agents = [
  {
    id: "zotigo" as const,
    label: "Zotigo",
    availability: "available" as const,
    capabilities: { profiles: true, models: false, steering: true, approvals: true },
  },
  {
    id: "codex" as const,
    label: "Codex",
    availability: "available" as const,
    capabilities: { profiles: false, models: true, steering: true, approvals: true },
  },
];
const profiles = [
  { name: "gemini", provider: "google", model: "gemini" },
  { name: "qwen", provider: "qwen", model: "qwen" },
];
const codexModels = [
  { id: "gpt-5", display_name: "GPT-5", is_default: true, supported_reasoning_efforts: ["low", "medium"] },
  { id: "gpt-6", display_name: "GPT-6", is_default: false, supported_reasoning_efforts: ["medium", "high"] },
];

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><main id=outside></main><div id=root></div></body></html>", {
    pretendToBeVisual: true,
    url: "https://zotigo.test",
  });
  const replacements = {
    window: dom.window,
    localStorage: dom.window.localStorage,
    document: dom.window.document,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    navigator: dom.window.navigator,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
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

function click(element: Element) {
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

async function openCustom(trigger: Element) {
  await act(async () => click(trigger));
  const custom = [...document.querySelectorAll('button')].find((b) => b.textContent === "Custom");
  if (custom) await act(async () => click(custom));
}

function pointerOver(element: Element) {
  element.dispatchEvent(new window.MouseEvent("pointerover", { bubbles: true }));
}

function keydown(element: Element, key: string) {
  element.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key }));
}

function Harness({ initialAgent = "zotigo", disabled = false, agentLocked = false, host = "test" }: { initialAgent?: AgentKind; disabled?: boolean; agentLocked?: boolean; host?: string }) {
  const [agent, setAgent] = useState<AgentKind>(initialAgent);
  const [profile, setProfile] = useState("gemini");
  const [model, setModel] = useState("gpt-5");
  const [effort, setEffort] = useState("medium");
  const saved = useModelFavorites(host);
  const select = (favorite: ModelFavorite) => {
    setAgent(favorite.agent);
    if (favorite.agent === "codex") { setModel(favorite.model); setEffort(favorite.reasoningEffort); }
    else setProfile(favorite.profile);
  };
  return (
    <RuntimeSettingsPicker
      favorites={{ ...saved, select }}
      agentLocked={agentLocked}
      agents={agents}
      selectedAgent={agent}
      onSelectAgent={setAgent}
      profiles={profiles}
      selectedProfile={profile}
      onSelectProfile={setProfile}
      codexModels={codexModels}
      selectedCodexModel={model}
      onSelectCodexModel={setModel}
      selectedCodexReasoningEffort={effort}
      onSelectCodexReasoningEffort={setEffort}
      disabled={disabled}
    />
  );
}

async function mounted(ui: React.ReactNode) {
  const container = document.querySelector("#root") as HTMLElement;
  const root: Root = createRoot(container);
  await act(async () => root.render(ui));
  return { container: document.body, root };
}

test("hovering then clicking a section keeps the cascade open after selection", async () => {
  const restore = installDom();
  try {
    const { container, root } = await mounted(<Harness />);
    const trigger = container.querySelector(".runtime-settings-trigger")!;
    await openCustom(trigger);
    const customButton = [...document.querySelectorAll('button')].find((b) => b.textContent === "Custom");
    if (customButton) await act(async () => click(customButton));
    const profile = container.querySelector('[data-runtime-section="profile"]')!;
    await act(async () => pointerOver(profile));
    assert.ok(container.querySelector('[aria-label="profile options"]'));
    await act(async () => click(profile));
    assert.ok(container.querySelector('[aria-label="profile options"]'));
    const qwen = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="profile options"] button')]
      .find((button) => button.textContent?.includes("qwen"))!;
    await act(async () => click(qwen));
    assert.match(trigger.getAttribute("aria-label") ?? "", /qwen/);
    assert.ok(container.querySelector('[aria-label="Runtime settings"]'));
    assert.ok(container.querySelector('[aria-label="profile options"]'));
    await act(async () => root.unmount());
  }
  finally {
    restore();
  }
});

test("keyboard navigation restores focus and closes one menu level at a time", async () => {
  const restore = installDom();
  try {
    const { container, root } = await mounted(<Harness initialAgent="codex" />);
    const trigger = container.querySelector<HTMLButtonElement>(".runtime-settings-trigger")!;
    await openCustom(trigger);
    const model = container.querySelector<HTMLButtonElement>('[data-runtime-section="model"]')!;
    model.focus();
    await act(async () => keydown(model, "ArrowRight"));
    assert.ok(container.querySelector('[aria-label="model options"]'));
    await act(async () => keydown(document.activeElement!, "ArrowLeft"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    assert.equal(document.activeElement, model);
    assert.equal(container.querySelector('[aria-label="model options"]'), null);
    await act(async () => keydown(model, "ArrowRight"));
    await act(async () => keydown(document.activeElement!, "Escape"));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    assert.equal(document.activeElement, model);
    assert.ok(container.querySelector('[aria-label="Runtime settings"]'));
    await act(async () => keydown(model, "Escape"));
    assert.ok([...container.querySelectorAll("button")].some((b) => b.textContent === "Custom"));
    await act(async () => keydown(document.activeElement!, "Escape"));
    assert.equal(container.querySelector('[aria-label="Runtime settings"]'), null);
    assert.equal(document.activeElement, trigger);
    await act(async () => root.unmount());
  }
  finally {
    restore();
  }
});

test("disabled settings block all choices and outside or trigger clicks close the menu", async () => {
  const restore = installDom();
  try {
    const { container, root } = await mounted(<Harness />);
    const trigger = container.querySelector<HTMLButtonElement>(".runtime-settings-trigger")!;
    await openCustom(trigger);
    await act(async () => pointerOver(container.querySelector('[data-runtime-section="profile"]')!));
    await act(async () => root.render(<Harness disabled />));
    assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled));
    await act(async () => root.render(<Harness />));
    assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => !button.disabled));
    await act(async () => document.querySelector("#outside")!.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(container.querySelector('[aria-label="Runtime settings"]'), null);
    await openCustom(trigger);
    assert.ok(container.querySelector('[aria-label="Runtime settings"]'));
    await openCustom(trigger);
    assert.equal(container.querySelector('[aria-label="Runtime settings"]'), null);
    await act(async () => root.unmount());
  }
  finally {
    restore();
  }
});

test("unavailable Codex settings still allow switching the Agent back to Zotigo", async () => {
  const restore = installDom();
  try {
    function RecoverableHarness() {
      const [agent, setAgent] = useState<AgentKind>("codex");
      return <RuntimeSettingsPicker
        favorites={{ items: [], select: () => {} }}
        agents={agents}
        selectedAgent={agent}
        onSelectAgent={setAgent}
        profiles={profiles}
        selectedProfile="gemini"
        onSelectProfile={() => {}}
        codexModels={[]}
        selectedCodexModel=""
        onSelectCodexModel={() => {}}
        selectedCodexReasoningEffort=""
        onSelectCodexReasoningEffort={() => {}}
        codexSettingsDisabled
        disabled={false}
      />;
    }
    const { container, root } = await mounted(<RecoverableHarness />);
    const trigger = container.querySelector<HTMLButtonElement>(".runtime-settings-trigger")!;
    assert.equal(trigger.disabled, false);
    await openCustom(trigger);
    const agentRow = container.querySelector<HTMLButtonElement>('[data-runtime-section="agent"]')!;
    const modelRow = container.querySelector<HTMLButtonElement>('[data-runtime-section="model"]')!;
    assert.equal(agentRow.disabled, false);
    assert.equal(modelRow.disabled, true);
    await act(async () => click(agentRow));
    await act(async () => click([...container.querySelectorAll<HTMLButtonElement>('[aria-label="agent options"] button')].find((value) => value.textContent?.includes("Zotigo"))!));
    assert.match(trigger.textContent ?? "", /gemini/);
    await act(async () => root.unmount());
  }
  finally {
    restore();
  }
});

test("portaled cascade uses viewport space even inside a clipped side-panel layout", async () => {
  const restore = installDom();
  try {
    const { root } = await mounted(<Harness initialAgent="codex" />);
    const wrapper = document.querySelector<HTMLElement>(".runtime-settings-wrap")!;
    wrapper.getBoundingClientRect = () => ({ right: 900, top: 650 } as DOMRect);
    await openCustom(document.querySelector(".runtime-settings-trigger")!);
    await act(async () => click(document.querySelector('[data-runtime-section="model"]')!));
    const menu = document.querySelector<HTMLElement>(".runtime-settings-menu")!;
    assert.equal(menu.parentElement, document.body);
    assert.equal(menu.style.position, "fixed");
    assert.equal(menu.dataset.submenuSide, "left");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    wrapper.getBoundingClientRect = () => ({ right: 350, top: 650 } as DOMRect);
    await act(async () => window.dispatchEvent(new window.Event("resize")));
    assert.equal(menu.dataset.submenuSide, "inline");
    assert.ok([...menu.querySelectorAll("button")].some((b) => b.textContent?.includes("Back")));
    await act(async () => root.unmount());
  } finally { restore(); }
});

test("picker reads saved favorites and selects without exposing management actions", async () => {
  const restore = installDom();
  try {
    localStorage.setItem("zotigo.model-favorites.v1:test", JSON.stringify([{ agent: "codex", model: "gpt-5", reasoningEffort: "medium" }]));
    const mountedPicker = await mounted(<Harness />);
    await act(async () => click(document.querySelector(".runtime-settings-trigger")!));
    const favorite = document.querySelector<HTMLButtonElement>('.runtime-favorite > button')!;
    assert.match(favorite.textContent!, /GPT-5 · medium/);
    await act(async () => click(favorite));
    assert.match(document.querySelector(".runtime-settings-trigger")!.textContent!, /GPT-5 · medium/);
    assert.equal(document.querySelector(".runtime-settings-menu"), null);
    await act(async () => click(document.querySelector(".runtime-settings-trigger")!));
    assert.equal(document.querySelector('.runtime-favorite-remove'), null);
    await act(async () => click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Custom')!));
    assert.doesNotMatch(document.querySelector('.runtime-settings-menu')!.textContent!, /Save to favorites|Remove from favorites/);
    await act(async () => mountedPicker.root.unmount());
  } finally { restore(); }
});

 test("favorites stay host-scoped and incompatible saved choices are disabled", async () => {
  const restore = installDom();
  try {
    localStorage.setItem("zotigo.model-favorites.v1:test", JSON.stringify([
      { agent: "codex", model: "missing", reasoningEffort: "medium" },
      { agent: "zotigo", profile: "gemini" },
      { agent: "codex", model: "gpt-5", reasoningEffort: "medium" },
    ]));
    const { root } = await mounted(<Harness initialAgent="codex" agentLocked />);
    await act(async () => click(document.querySelector(".runtime-settings-trigger")!));
    const choices = [...document.querySelectorAll<HTMLButtonElement>(".runtime-favorite > button:first-child")];
    assert.deepEqual(choices.map((b) => b.disabled), [true, true, false]);
    assert.equal(document.querySelector(".runtime-favorite-remove"), null);
    await act(async () => root.render(<Harness key="another-host" host="another-host" />));
    await act(async () => click(document.querySelector(".runtime-settings-trigger")!));
    assert.equal(document.querySelector(".runtime-favorite"), null);
    assert.ok(localStorage.getItem("zotigo.model-favorites.v1:test"));
    await act(async () => root.unmount());
  } finally { restore(); }
});
