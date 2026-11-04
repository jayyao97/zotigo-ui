import type { DisplayToolCall, DisplayToolResult } from "./zotigod";

export function isCompletionTriggerCall(call: DisplayToolCall | undefined): boolean {
  return Boolean(call?.name && /(^|[._])create_completion_trigger$/.test(call.name));
}

export function createdCompletionTrigger(call: DisplayToolCall | undefined, result: DisplayToolResult | undefined): string | undefined {
  if (!isCompletionTriggerCall(call) || !result || result.is_error) return;
  let value = result.json;
  if (value === undefined) {
    try { value = JSON.parse(result.text || (result.content ?? []).map(part => part.text ?? "").join("\n")); } catch { return; }
  }
  if (!value || typeof value !== "object" || !("trigger_id" in value)) return;
  return typeof value.trigger_id === "string" && value.trigger_id ? value.trigger_id : undefined;
}
