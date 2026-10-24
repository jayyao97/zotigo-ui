import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { createContext, useContext } from "react";
import type { ClientApi } from "../shared/clientTypes";

export const ClientContext = createContext<{ api: ClientApi; kind: "desktop" | "web"; remote?: boolean; signOut?: () => Promise<void> } | null>(null);

export function useClient() {
  useLocale();
  const client = useContext(ClientContext);
  if (!client) throw new Error(t("clientContext.clientProviderIsMissing"));
  return client;
}
