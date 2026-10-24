import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { en, type Message } from "../shared/i18n/en";
import { zhCN } from "../shared/i18n/zh-CN";
import { getLocale, localeStorageKey, setLocale, t } from "../shared/i18n";
import { changeLanguage, initializeLanguage } from "../src/i18n";
import { SettingsPage } from "../src/SettingsPage";
import { ClientContext } from "../src/ClientContext";
import { ModelFavoritesProvider } from "../src/modelFavorites";
import type { ClientApi } from "../shared/clientTypes";
import { buildToolRenderProjection } from "../shared/sessionDisplay";
import { AssistantContentView, compactDisplayPaths } from "../src/conversation/ConversationTimeline";
import { messageTimestamp } from "../src/conversation/messageTimestamp";

const variants = (message: Message) => typeof message === "string" ? [message] : Object.values(message);
const placeholders = (value: string) => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();

test("catalogs cover identical keys and preserve all interpolation parameters", () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    const expected = placeholders(variants(en[key])[0]);
    for (const value of [...variants(en[key]), ...variants(zhCN[key])]) {
      assert.ok(value.trim(), key);
      assert.deepEqual(placeholders(value), expected, key);
    }
  }
  try {
    setLocale("en");
    assert.equal(t("timeline.activity.command", { count: 1 }), "Ran 1 command");
    assert.equal(t("timeline.activity.command", { count: 2 }), "Ran 2 commands");
    setLocale("zh-CN");
    assert.equal(t("timeline.activity.command", { count: 2 }), "运行了 2 个命令");
    assert.equal(compactDisplayPaths("cd /workspace && cat $WORKSPACE/file.ts", "/workspace"), "cd . && cat file.ts", "path punctuation is never translated");
    assert.equal(t("host.connected", { host: "<local>{host}" }), "<local>{host}：已连接");
    const value = "2026-10-20T12:00:00Z";
    assert.deepEqual(messageTimestamp(value), messageTimestamp(value, new Date(), "zh-CN"));
  } finally { setLocale("en"); }
});

test("settings switch language live, persist locally, and retain drafts and protocol values", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  localStorage.setItem(localeStorageKey, "invalid");
  const cleanup = initializeLanguage();
  assert.equal(getLocale(), "en");
  const api = {
    getProfiles: async () => ({ profiles: [], default_profile: "" }),
    getAgents: async () => ({ agents: [] }),
    getDesktopState: async () => ({ workspaces: [] }),
  } as unknown as ClientApi;
  let setDraft: (value: string) => void = () => {};
  let translationChanges = 0;
  function Harness() {
    const [draft, update] = useState("draft");
    setDraft = update;
    return <ClientContext.Provider value={{ api, kind: "web" }}><ModelFavoritesProvider host="fixture">
      <div data-empty-result><AssistantContentView itemId="empty" projection={buildToolRenderProjection([])} content={[{ type: "tool_result", tool_result: {} }]} /></div>
      <div data-real-output><AssistantContentView itemId="output" projection={buildToolRenderProjection([])} content={[{ type: "tool_result", tool_result: { text: "(No output)" } }]} /></div>
      <div data-read-call><AssistantContentView itemId="read" projection={buildToolRenderProjection([])} content={[{ type: "tool_call", tool_call: { id: "call-read", name: "read_file", arguments: '{"path":"file.ts"}' } }]} /></div>
      <div data-unknown-call><AssistantContentView itemId="unknown" projection={buildToolRenderProjection([])} content={[{ type: "tool_call", tool_call: { id: "call-custom", name: "Custom_Tool", arguments: '{}' } }]} /></div>
      <textarea data-draft value={draft} onChange={event => update(event.target.value)} />
      <SettingsPage hostName="fixture" onSync={() => {}} syncing={false} syncStatus="" syncError="" translationLanguage="en" onTranslationLanguageChange={() => { translationChanges++; }} translationProfile="" onTranslationProfileChange={() => {}} thinkingDisplay="latest" onThinkingDisplayChange={() => {}} onManageHosts={() => {}} onBack={() => {}} />
    </ModelFavoritesProvider></ClientContext.Provider>;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Harness />));
    const draftNode = document.querySelector("[data-draft]");
    await act(async () => setDraft("unsent 用户内容"));
    const select = document.querySelector('#language-settings-heading + .settings-card select') as HTMLSelectElement;
    await act(async () => { select.value = "zh-CN"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(localStorage.getItem(localeStorageKey), "zh-CN");
    assert.equal(document.documentElement.lang, "zh-CN");
    assert.equal(document.querySelector("h1")?.textContent, t("settingsPage.general"));
    assert.equal(document.querySelector("[data-draft]"), draftNode, "language switching must not remount the page");
    assert.equal((draftNode as HTMLTextAreaElement).value, "unsent 用户内容");
    const sendMode = document.querySelector('select[aria-label="' + t("settingsPage.defaultSendMode") + '"]') as HTMLSelectElement;
    assert.equal(sendMode.value, "steering");
    assert.ok(document.querySelector("[data-empty-result]")?.textContent?.includes(t("conversationTimeline.toolFinished")));
    assert.ok(!document.querySelector("[data-empty-result]")?.textContent?.includes(t("conversationTimeline.toolReturnedOutput")));
    assert.ok(document.querySelector("[data-real-output]")?.textContent?.includes(t("conversationTimeline.toolReturnedOutput")), "literal user output is not an internal sentinel");
    assert.ok(document.querySelector("[data-read-call]")?.textContent?.includes(t("timeline.action.read", { target: "file" })));
    assert.ok(document.querySelector("[data-unknown-call]")?.textContent?.includes("Custom_Tool"), "unknown tool identifiers remain unchanged");
    assert.equal(translationChanges, 0, "UI language does not change translation target");
    await act(async () => { window.dispatchEvent(new dom.window.StorageEvent("storage", { key: localeStorageKey, newValue: "en" })); });
    assert.equal(document.documentElement.lang, "en");
    await act(async () => changeLanguage("zh-CN"));
    cleanup();
    const cleanupReload = initializeLanguage();
    assert.equal(getLocale(), "zh-CN", "reload restores preference");
    cleanupReload();
  } finally {
    await act(async () => root.unmount());
    cleanup();
    setLocale("en");
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("renderer JSX copy uses catalog keys, including accessibility labels", () => {
  const violations: string[] = [];
  for (const path of readdirSync("src", { recursive: true }).map(String).filter(path => path.endsWith(".tsx"))) {
    const file = "src/" + path;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function walk(node: ts.Node) {
      const raw = ts.isJsxText(node) ? node.text : ts.isJsxAttribute(node) && ["aria-label", "title", "placeholder", "alt", "action", "empty", "description", "label", "emptyLabel", "confirmLabel", "cancelLabel"].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : "";
      if (/[a-zA-Z\u4e00-\u9fff]/.test(raw)) violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${raw.trim()}`);
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  assert.deepEqual(violations, [], "Move UI copy to shared/i18n catalogs");
});
