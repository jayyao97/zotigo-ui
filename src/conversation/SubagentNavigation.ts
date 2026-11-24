import { createContext } from "react";

/** Opens the side-panel transcript for a spawn call when its run is known. */
export interface SubagentNavigationValue {
  has(toolCallId: string): boolean;
  open(toolCallId: string): void;
}

export const SubagentNavigation = createContext<SubagentNavigationValue | null>(null);
