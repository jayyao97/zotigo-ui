import test from "node:test";
import assert from "node:assert/strict";
import { setLocale, getLocale, t } from "../../shared/i18n/index";
import { stateLabel } from "../../shared/i18n/display";
import { formatElapsed } from "../../shared/turnDuration";
import { historicalToolSummary } from "../../shared/sessionDisplay";
import { messageTimestamp } from "../../shared/messageTimestamp";
import { availableModelChoice } from "../src/core/modelPicker";
import { clampSidebarWidth, sidebarDefaultWidth } from "../../shared/sidebarWidth";
import type { DisplayItem } from "../../shared/zotigod";

test("Chinese UI formats shared activity without changing model identity or provider values", () => {
  const previous = getLocale();
  try {
    setLocale("zh-CN");
    const start = "2026-10-24T00:00:00Z";
    assert.equal(formatElapsed(start, Date.parse(start) + 62000), "1分 2秒");
    assert.equal(formatElapsed(start, Date.parse(start) + 3900000), "1小时 5分");
    assert.equal(stateLabel("running"), "运行中");
    assert.equal(stateLabel("provider_custom_state"), "provider_custom_state");
    assert.equal(t("mobile.useValue", { p0: "Custom model {name}" }), "使用 Custom model {name}");
    assert.equal(historicalToolSummary([{ content: [{ type: "tool_call", tool_call: { name: "exec_command" } }] }] as DisplayItem[]), "运行了 1 个命令");
    assert.deepEqual(messageTimestamp(start), messageTimestamp(start, new Date(), "zh-CN"));
    assert.ok(availableModelChoice({ agent: "codex", model: "real-model", reasoningEffort: "high" }, [{ id: "codex", label: "Codex", models: [{ id: "real-model", display_name: "Actual model", is_default: false, supported_reasoning_efforts: ["high"] }] }]));
  } finally { setLocale(previous); }
});

test("sidebar leaves room for the conversation in split view and clamps saved widths", () => {
  assert.equal(sidebarDefaultWidth, 320);
  assert.equal(clampSidebarWidth(900, 1024), 480);
  assert.equal(clampSidebarWidth(480, 768), 348);
  assert.equal(clampSidebarWidth(100, 1024), 240);
  assert.equal(clampSidebarWidth(NaN, 1024), 320);
  assert.equal(clampSidebarWidth(300, 600), 240);
});


test("conversation activity renders when Hermes has no Intl.PluralRules", () => {
  const previous = getLocale();
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "PluralRules")!;
  try {
    Object.defineProperty(Intl, "PluralRules", { configurable: true, value: undefined });
    setLocale("en");
    for (const [count, expected] of [[0, "Ran 0 commands"], [1, "Ran 1 command"], [2, "Ran 2 commands"]] as const) {
      assert.equal(t("timeline.activity.command", { count }), expected);
    }
    assert.equal(historicalToolSummary([{ content: [{ type: "tool_call", tool_call: { name: "exec_command" } }] }] as DisplayItem[]), "Ran 1 command");
    setLocale("zh-CN");
    assert.equal(t("timeline.activity.command", { count: 2 }), "运行了 2 个命令");
  } finally {
    Object.defineProperty(Intl, "PluralRules", descriptor);
    setLocale(previous);
  }
});
