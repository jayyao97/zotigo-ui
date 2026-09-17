import { useRef, useState, type SetStateAction } from "react";
import { emptySidePanelTabs, type SidePanelTabsState } from "../shared/sidePanelTabs";

interface SessionSidePanel {
  tabs: SidePanelTabsState;
  open: boolean;
  expanded: boolean;
  directory: { path: string; sessionId?: string } | null;
}

export type SessionSidePanels = Record<string, SessionSidePanel>;
const emptyPanel: SessionSidePanel = { tabs: emptySidePanelTabs, open: false, expanded: false, directory: null };

export function useSessionSidePanel(key: string, initial: SessionSidePanels = {}) {
  const [panels, setPanels] = useState(initial);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const panel = panels[key] ?? emptyPanel;

  // Capture the originating session, including for callbacks finishing after navigation.
  function update<K extends keyof SessionSidePanel>(field: K, action: SetStateAction<SessionSidePanel[K]>) {
    setPanels((current) => {
      const previous = current[key] ?? emptyPanel;
      const value = typeof action === "function" ? action(previous[field]) : action;
      const next = { ...previous, [field]: value };
      const closedLastFile = previous.tabs.tabs.some((tab) => tab.kind === "file")
        && next.tabs.tabs.every((tab) => tab.kind === "files");
      if (field === "tabs" && previous.tabs.tabs.length > 0 && (next.tabs.tabs.length === 0 || closedLastFile)) {
        next.open = false;
        next.expanded = false;
      }
      return { ...current, [key]: next };
    });
  }

  return {
    panels,
    sidePanelTabs: panel.tabs,
    sidePanelOpen: panel.open,
    sidePanelExpanded: panel.expanded,
    directoryLocation: panel.directory,
    setSidePanelTabs: (action: SetStateAction<SidePanelTabsState>) => update("tabs", action),
    setSidePanelOpen: (action: SetStateAction<boolean>) => update("open", action),
    setSidePanelExpanded: (action: SetStateAction<boolean>) => update("expanded", action),
    setDirectoryLocation: (action: SetStateAction<SessionSidePanel["directory"]>) => update("directory", action),
    fileOpenInOtherSession: (path: string) => Object.entries(panelsRef.current).some(([id, state]) =>
      id !== key && state.tabs.tabs.some((tab) => tab.kind === "file" && tab.path === path)),
  };
}
