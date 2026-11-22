import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { ClientApi } from "../shared/clientTypes";
import { setLocale } from "../shared/i18n/index";
import type { UsageActivity, UsageQuery, UsageResult, UsageSessionPage, UsageSessionsQuery } from "../shared/usage";
import { ClientContext } from "../src/ClientContext";
import { UsageSettings, usageTimeZoneStorageKey } from "../src/usage/UsageSettings";
import { clearUsageCache } from "../src/usage/useUsageData";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  const replacements = { window: dom.window, document: dom.window.document, Node: dom.window.Node, Event: dom.window.Event, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, navigator: dom.window.navigator, localStorage: dom.window.localStorage, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  // react-dom was loaded before this DOM existed and watches text inputs
  // through its legacy value-change polyfill, which needs these hooks.
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  return () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  };
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const totals = (total: number, cacheRead = 0, cacheInput = 0) => ({ total, input: total - cacheRead, cacheRead, cacheWrite: 0, output: 0, cacheInput, turns: 2 });
const activity = (overrides: Partial<UsageActivity> = {}): UsageActivity => ({
  trackingSince: "2026-11-01T00:00:00Z", range: totals(150_000, 80_000, 100_000), allTime: totals(3_000_000), peakDay: { date: "2026-11-10", total: 120_000 },
  byModel: [{ model: "claude", runtime: "zotigo", ...totals(100_000, 80_000, 100_000) }, { model: "plain", runtime: "codex", ...totals(50_000) }],
  days: [], currentStreakDays: 3, longestStreakDays: 9, ...overrides,
});

function fakeApi(options: { unsupported?: boolean; activity?: UsageActivity } = {}) {
  const activityCalls: UsageQuery[] = [];
  const sessionCalls: UsageSessionsQuery[] = [];
  const api = {
    getUsageActivity: async (query: UsageQuery): Promise<UsageResult<UsageActivity>> => {
      activityCalls.push(query);
      return options.unsupported ? { supported: false } : { supported: true, data: options.activity ?? activity() };
    },
    getUsageSessions: async (query: UsageSessionsQuery): Promise<UsageResult<UsageSessionPage>> => {
      sessionCalls.push(query);
      if (options.unsupported) return { supported: false };
      return { supported: true, data: { sessions: [
        { sessionId: "s1", title: "Fix the channel bug", availability: "available", models: ["claude"], channelTurns: 2, lastCompletedAt: "", ...totals(100_000, 80_000, 100_000) },
        { sessionId: "s2", title: "", availability: "deleted", models: ["plain"], channelTurns: 0, lastCompletedAt: "", ...totals(50_000) },
        { sessionId: "s3", title: "Old work", availability: "archived", models: ["plain"], channelTurns: 0, lastCompletedAt: "", ...totals(1_000) },
      ] } };
    },
  } as unknown as ClientApi;
  return { api, activityCalls, sessionCalls };
}

let mounted: ReturnType<typeof createRoot> | null = null;
async function unmount() {
  if (mounted) { const root = mounted; mounted = null; await act(async () => root.unmount()); }
}

async function render(api: ClientApi, onOpenSession?: (id: string) => void) {
  const root = createRoot(document.getElementById("root")!);
  mounted = root;
  await act(async () => {
    root.render(<ClientContext.Provider value={{ api, kind: "desktop" } as never}><UsageSettings hostId="local" hostName="dev" onOpenSession={onOpenSession} /></ClientContext.Provider>);
  });
  await flush();
  return root;
}

test("usage page renders overview, models and ranked sessions", async () => {
  const restore = installDom();
  clearUsageCache();
  setLocale("zh-CN");
  try {
    localStorage.setItem(usageTimeZoneStorageKey, "Asia/Kathmandu");
    const opened: string[] = [];
    const { api, activityCalls, sessionCalls } = fakeApi();
    await render(api, id => opened.push(id));
    const text = document.body.textContent ?? "";
    assert.match(text, /300万/);
    assert.match(text, /15万/);
    assert.match(text, /80%/);
    assert.match(text, /9 天/);
    assert.match(text, /已删除的会话/);
    assert.match(text, /已归档/);
    // The model without cache reads shows a dash, not 0%.
    const plainRow = [...document.querySelectorAll("tr")].find(row => row.textContent?.includes("plain"));
    assert.match(plainRow?.textContent ?? "", /—$/);
    assert.ok(activityCalls.every(call => call.timeZone === "Asia/Kathmandu"));
    assert.equal(sessionCalls[0].limit, 20);

    const rows = [...document.querySelectorAll<HTMLButtonElement>("button.usage-session-row")];
    assert.equal(rows.length, 1, "only available sessions open");
    await act(async () => { rows[0].click(); });
    assert.deepEqual(opened, ["s1"]);
    // A majority of channel turns marks the session.
    assert.match(rows[0].textContent ?? "", /渠道/);
  } finally {
    await unmount();
    setLocale("en");
    restore();
  }
});

test("changing the time zone refetches and returning to a previous zone uses the cache", async () => {
  const restore = installDom();
  clearUsageCache();
  try {
    localStorage.setItem(usageTimeZoneStorageKey, "UTC");
    const { api, activityCalls } = fakeApi();
    await render(api);
    const before = activityCalls.length;
    const input = document.querySelector<HTMLInputElement>(".usage-zone input")!;
    const commit = async (value: string) => {
      await act(async () => {
        input.focus();
        // Bypass React's value tracker so the change is detected.
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "x", bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await flush();
    };
    await commit("Asia/Shanghai");
    assert.ok(activityCalls.slice(before).some(call => call.timeZone === "Asia/Shanghai"));
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), "Asia/Shanghai");
    // Names Intl accepts but the daemon rejects are not saved.
    await commit("asia/shanghai");
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), "Asia/Shanghai");
    await commit("+08:00");
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), "Asia/Shanghai");
    await commit("Not/AZone");
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), "Asia/Shanghai");
    assert.equal(input.value, "Asia/Shanghai");

    // Cached results render at once while the request is refreshed.
    await commit("UTC");
    assert.match(document.body.textContent ?? "", /3M/);
  } finally {
    await unmount();
    restore();
  }
});

test("an older daemon shows an update hint", async () => {
  const restore = installDom();
  clearUsageCache();
  try {
    const { api } = fakeApi({ unsupported: true });
    await render(api);
    assert.match(document.body.textContent ?? "", /does not support usage statistics/);
    assert.equal(document.querySelector(".usage-overview"), null);
  } finally {
    await unmount();
    restore();
  }
});

test("clicking a heatmap day selects it as the ranking period", async () => {
  const restore = installDom();
  clearUsageCache();
  try {
    localStorage.setItem(usageTimeZoneStorageKey, "UTC");
    const today = new Date().toISOString().slice(0, 10);
    const { api, sessionCalls } = fakeApi({ activity: activity({ days: [{ date: today, ...totals(10) }] }) });
    await render(api);
    const cells = [...document.querySelectorAll(".usage-heatmap rect")];
    assert.ok(cells.length >= 365);
    await act(async () => { cells.at(-1)!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await flush();
    assert.deepEqual(sessionCalls.at(-1) && [sessionCalls.at(-1)!.from, sessionCalls.at(-1)!.to], [today, today]);
    assert.equal(document.querySelector<HTMLSelectElement>(".usage-period select")!.value, "selection");
    // The heatmap has one tab stop, today's cell, and is operable from the keyboard.
    const focusable = [...document.querySelectorAll('.usage-heatmap [tabindex="0"]')];
    assert.equal(focusable.length, 1);
    assert.equal(focusable[0], document.querySelectorAll(".usage-heatmap rect")[cells.length - 1]);
    assert.equal(focusable[0].getAttribute("role"), "button");
    assert.equal(focusable[0].getAttribute("aria-pressed"), "true");
    // Clicking the same day again returns to the default period.
    await act(async () => { document.querySelectorAll(".usage-heatmap rect")[cells.length - 1].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await flush();
    assert.equal(document.querySelector<HTMLSelectElement>(".usage-period select")!.value, "7");
  } finally {
    await unmount();
    restore();
  }
});
