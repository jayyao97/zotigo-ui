import { createContext, useContext } from "react";
import type { ClientApi } from "../shared/clientTypes";

export const ClientContext = createContext<{ api: ClientApi; kind: "desktop" | "web"; signOut?: () => Promise<void> } | null>(null);

export function useClient() {
  const client = useContext(ClientContext);
  if (!client) throw new Error("Client provider is missing.");
  return client;
}
