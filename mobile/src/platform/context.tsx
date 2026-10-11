import { createContext, useContext } from "react";
import type { DaemonClient } from "../core/client";
export const DaemonContext = createContext<DaemonClient | null>(null);
export function useDaemon(): DaemonClient {
  const client = useContext(DaemonContext);
  if (!client) throw new Error("No device selected.");
  return client;
}
