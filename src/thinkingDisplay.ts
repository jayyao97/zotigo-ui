import type { DisplayItem } from "../shared/zotigod";

export type ThinkingDisplayMode = "expanded" | "collapsed" | "latest";

export const thinkingDisplayStorageKey = "zotigo.thinking-display";

export function parseThinkingDisplayMode(value: string | null): ThinkingDisplayMode {
  return value === "collapsed" || value === "latest" ? value : "expanded";
}

export function defaultThinkingDisclosureOpen(mode: ThinkingDisplayMode, latest: boolean): boolean {
  return mode === "expanded" || (mode === "latest" && latest);
}

export function latestReasoningItemId(items: DisplayItem[]): string | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const content = item.content ?? [];
    if (item.type === "assistant_message" && content.length > 0 && content.every((part) => part.type === "reasoning")) {
      return item.id;
    }
  }
  return undefined;
}
