export type SidePanelTab =
  | { id: "subagents"; kind: "subagents" }
  | { id: `subagent:${string}`; kind: "subagent"; runId: string }
  | { id: `file:${string}`; kind: "file"; path: string; line?: number; column?: number };

export interface SidePanelTabsState {
  tabs: SidePanelTab[];
  activeTabId: string | null;
}

export const emptySidePanelTabs: SidePanelTabsState = { tabs: [], activeTabId: null };

export function openSidePanelTab(state: SidePanelTabsState, tab: SidePanelTab): SidePanelTabsState {
  const existingIndex = state.tabs.findIndex((candidate) => candidate.id === tab.id);
  const tabs = existingIndex === -1
    ? [...state.tabs, tab]
    : state.tabs.map((candidate, index) => index === existingIndex ? tab : candidate);
  return { tabs, activeTabId: tab.id };
}

export function closeSidePanelTab(state: SidePanelTabsState, tabId: string): SidePanelTabsState {
  const index = state.tabs.findIndex((candidate) => candidate.id === tabId);
  if (index === -1) return state;
  const tabs = state.tabs.filter((candidate) => candidate.id !== tabId);
  if (state.activeTabId !== tabId) return { tabs, activeTabId: state.activeTabId };
  return { tabs, activeTabId: tabs[Math.min(index, tabs.length - 1)]?.id ?? null };
}

export function subagentSidePanelTab(runId: string): SidePanelTab {
  return { id: `subagent:${runId}`, kind: "subagent", runId };
}

export function fileSidePanelTab(path: string, line?: number, column?: number): SidePanelTab {
  return { id: `file:${path}`, kind: "file", path, line, column };
}
