export type ThinkingDisplayMode = "auto" | "expanded" | "collapsed";

export const thinkingDisplayStorageKey = "zotigo.thinking-display";

export function parseThinkingDisplayMode(value: string | null): ThinkingDisplayMode {
  return value === "expanded" || value === "collapsed" ? value : "auto";
}

export function defaultThinkingDisclosureOpen(mode: ThinkingDisplayMode, active: boolean): boolean {
  return mode === "expanded" || (mode === "auto" && active);
}

export function defaultActivityDisclosureOpen(
  active: boolean,
  containsReasoning: boolean,
  mode?: ThinkingDisplayMode,
): boolean {
  return active || (containsReasoning && mode === "expanded");
}
