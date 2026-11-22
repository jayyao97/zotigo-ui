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
import { discardUsageCache } from "../src/usage/useUsageData";
import { addDays } from "../src/usage/usageModel";

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
  discardUsageCache();
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

test("the time zone is picked from a searchable list, follows the system by default and reuses cached results", async () => {
  const restore = installDom();
  discardUsageCache();
  try {
    const system = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // An unusable stored name falls back to following the system zone.
    localStorage.setItem(usageTimeZoneStorageKey, "+08:00");
    const { api, activityCalls } = fakeApi();
    await render(api);
    assert.ok(activityCalls.every(call => call.timeZone === system));
    const trigger = () => document.querySelector<HTMLButtonElement>(".usage-zone-picker > button")!;
    assert.match(trigger().textContent ?? "", /System/);
    assert.equal(document.querySelector(".usage-zone-picker input"), null, "the zone is not typed into a field");

    const search = async (query: string) => {
      if (!document.querySelector(".usage-zone-menu")) await act(async () => trigger().click());
      // The full list is built in slices after opening.
      for (let attempt = 0; attempt < 50 && document.querySelector(".usage-zone-loading"); attempt++) await flush();
      assert.equal(document.querySelector(".usage-zone-loading"), null);
      const input = document.querySelector<HTMLInputElement>(".usage-zone-search input")!;
      await act(async () => {
        input.focus();
        // Bypass React's value tracker; its legacy change polyfill notices on keydown.
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, query);
        input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "x", bubbles: true }));
      });
      return input;
    };
    const options = () => [...document.querySelectorAll<HTMLElement>('.usage-zone-options [role="option"]')];

    // Opening does not wait for the full list: system and UTC are there at once.
    await act(async () => trigger().click());
    assert.ok(document.querySelector(".usage-zone-loading"));
    assert.deepEqual(options().map(option => option.querySelector("strong")?.textContent), ["System", "UTC"]);
    // Following the system and UTC always lead the list.
    await search("");
    assert.match(options()[0].textContent ?? "", /System/);
    assert.match(options()[1].textContent ?? "", /^UTC.*Coordinated Universal Time/);
    let utcSearch = await search("utc");
    assert.match(options()[0].textContent ?? "", /^UTC/, "UTC itself comes before cities at UTC+0");
    await act(async () => { utcSearch.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });

    // Names match; the system row only shows for its own label.
    utcSearch = await search("shanghai");
    let input = utcSearch;
    assert.deepEqual(options().map(option => option.querySelector("small")?.textContent?.split(" · ")[0]), ["Asia/Shanghai"]);
    // Arrow keys move the active option; Enter while composing belongs to the input method.
    input = await search("+8");
    const activeId = () => input.getAttribute("aria-activedescendant");
    assert.equal(activeId(), options()[0].id);
    await act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    assert.equal(activeId(), options()[1].id);
    assert.ok(options()[1].classList.contains("is-active"));
    await act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })); });
    assert.ok(document.querySelector(".usage-zone-menu"), "a composing Enter does not choose");
    // Escape closes only the picker: the settings page ignores a handled Escape.
    const escape = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(escape); });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(document.querySelector(".usage-zone-menu"), null);
    assert.equal(document.activeElement, trigger(), "focus returns to the trigger");
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), "+08:00", "nothing was chosen");

    // Offsets match too; Enter picks the first match.
    input = await search("+5:45");
    assert.ok(options().length >= 1 && options().every(option => /UTC\+5:45/.test(option.textContent ?? "")));
    const before = activityCalls.length;
    await act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await flush();
    assert.equal(document.querySelector(".usage-zone-menu"), null);
    const nepal = localStorage.getItem(usageTimeZoneStorageKey) ?? "";
    assert.match(nepal, /^Asia\/Kath?mandu$/);
    assert.ok(activityCalls.slice(before).some(call => call.timeZone === nepal));
    assert.match(trigger().textContent ?? "", /UTC\+5:45/);

    // Nothing matches: nothing to choose, nothing saved.
    input = await search("Not/AZone");
    assert.equal(options().length, 0);
    await act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(document.querySelector(".usage-zone-menu"), null);
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), nepal);

    // The first row returns to following the system zone and forgets the choice.
    await act(async () => trigger().click());
    const systemRow = options()[0];
    assert.match(systemRow.textContent ?? "", new RegExp(`System.*${system}`));
    await act(async () => systemRow.click());
    await flush();
    assert.equal(localStorage.getItem(usageTimeZoneStorageKey), null);
    assert.equal(activityCalls.at(-1)!.timeZone, system);
    // Cached results render at once.
    assert.match(document.body.textContent ?? "", /3M/);
  } finally {
    await unmount();
    restore();
  }
});

test("an older daemon shows an update hint", async () => {
  const restore = installDom();
  discardUsageCache();
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

test("clicking a heatmap day selects it as the period", async () => {
  const restore = installDom();
  discardUsageCache();
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
    // The selection shows as a removable chip and no preset is active.
    assert.ok(document.querySelector(".usage-selection-chip"));
    assert.equal(document.querySelector('.usage-period [aria-pressed="true"]'), null);
    // The heatmap has one tab stop, today's cell, and is operable from the keyboard.
    const focusable = [...document.querySelectorAll('.usage-heatmap [tabindex="0"]')];
    assert.equal(focusable.length, 1);
    assert.equal(focusable[0], document.querySelectorAll(".usage-heatmap rect")[cells.length - 1]);
    assert.equal(focusable[0].getAttribute("role"), "button");
    assert.equal(focusable[0].getAttribute("aria-pressed"), "true");
    // Clicking the same day again returns to the default period.
    await act(async () => { document.querySelectorAll(".usage-heatmap rect")[cells.length - 1].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await flush();
    assert.equal(document.querySelector(".usage-selection-chip"), null);
    assert.equal(document.querySelector('.usage-period [aria-pressed="true"]')?.textContent, "7 days");

    // Clearing a selection returns to the preset chosen before it.
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>(".usage-period button")].find(button => button.textContent === "90 days")!.click());
    await act(async () => { document.querySelectorAll(".usage-heatmap rect")[cells.length - 1].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await act(async () => document.querySelector<HTMLButtonElement>(".usage-selection-chip button")!.click());
    assert.equal(document.querySelector('.usage-period [aria-pressed="true"]')?.textContent, "90 days");

    // The chip's close button also clears it; presets switch the period.
    await act(async () => { document.querySelectorAll(".usage-heatmap rect")[cells.length - 1].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await act(async () => document.querySelector<HTMLButtonElement>(".usage-selection-chip button")!.click());
    assert.equal(document.querySelector(".usage-selection-chip"), null);
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>(".usage-period button")].find(button => button.textContent === "30 days")!.click());
    await flush();
    assert.deepEqual([sessionCalls.at(-1)!.from, sessionCalls.at(-1)!.to], [addDays(today, -29), today]);
  } finally {
    await unmount();
    restore();
  }
});

test("discarding a host drops its cached usage and ignores requests already in flight", async () => {
  const restore = installDom();
  discardUsageCache();
  try {
    localStorage.setItem(usageTimeZoneStorageKey, "UTC");
    const shown = () => /3M/.test(document.body.textContent ?? "");
    const never = { ...fakeApi().api, getUsageActivity: () => new Promise(() => {}), getUsageSessions: () => new Promise(() => {}) } as ClientApi;

    await render(fakeApi().api);
    assert.ok(shown());
    await unmount();
    // Another host's discard keeps this host's cache.
    discardUsageCache("dev");
    await render(never);
    assert.ok(shown(), "cached usage renders at once");
    await unmount();
    discardUsageCache("local");
    await render(never);
    assert.equal(shown(), false, "an edited host must not show the previous machine's usage");
    await unmount();

    // A response that started before the discard is not cached.
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const slow = fakeApi().api;
    const delayed = { ...slow, getUsageActivity: async (query: UsageQuery) => { await gate; return slow.getUsageActivity(query); }, getUsageSessions: async (query: UsageSessionsQuery) => { await gate; return slow.getUsageSessions(query); } } as ClientApi;
    await render(delayed);
    discardUsageCache("local");
    await act(async () => release());
    await flush();
    assert.equal(shown(), false);
    await unmount();
    await render(never);
    assert.equal(shown(), false);
  } finally {
    await unmount();
    restore();
  }
});
