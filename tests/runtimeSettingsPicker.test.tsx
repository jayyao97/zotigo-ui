import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RuntimeSettingsPicker } from "../src/conversation/ConversationComposer";
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
  });
  const replacements = {
    window: dom.window,
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

function pointerOver(element: Element) {
  element.dispatchEvent(new window.MouseEvent("pointerover", { bubbles: true }));
}

function keydown(element: Element, key: string) {
  element.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key }));
}

function Harness({ initialAgent = "zotigo", disabled = false }: { initialAgent?: AgentKind; disabled?: boolean }) {
  const [agent, setAgent] = useState<AgentKind>(initialAgent);
  const [profile, setProfile] = useState("gemini");
  const [model, setModel] = useState("gpt-5");
  const [effort, setEffort] = useState("medium");
  return (
    <RuntimeSettingsPicker
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
  return { container, root };
}

test("hovering then clicking a section keeps the cascade open after selection", async () => {
  const restore = installDom();
  try {
    const { container, root } = await mounted(<Harness />);
    const trigger = container.querySelector(".runtime-settings-trigger")!;
    await act(async () => click(trigger));
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
    await act(async () => click(trigger));
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
    await act(async () => click(trigger));
    await act(async () => pointerOver(container.querySelector('[data-runtime-section="profile"]')!));
    await act(async () => root.render(<Harness disabled />));
    assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled));
    await act(async () => root.render(<Harness />));
    assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => !button.disabled));
    await act(async () => document.querySelector("#outside")!.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(container.querySelector('[aria-label="Runtime settings"]'), null);
    await act(async () => click(trigger));
    assert.ok(container.querySelector('[aria-label="Runtime settings"]'));
    await act(async () => click(trigger));
    assert.equal(container.querySelector('[aria-label="Runtime settings"]'), null);
    await act(async () => root.unmount());
  }
  finally {
    restore();
  }
});

test("runtime submenu stacks above the root menu in constrained layouts", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/styles.css"), "utf8");
  assert.match(css, /\.app-frame\.has-subagent-panel \.runtime-settings-submenu,[\s\S]*?\.conversation\.has-inspector \.runtime-settings-submenu\s*\{[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*calc\(100% \+ 8px\);/);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.runtime-settings-submenu\s*\{[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*calc\(100% \+ 8px\);/);
});
