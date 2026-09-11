import type { ClientApi, DesktopState } from "./clientTypes";

type HostNavigationClient = Pick<ClientApi, "getDesktopState" | "selectProject">;

export function loadHostDesktopState(
  client: HostNavigationClient,
  openNewSession: boolean,
): Promise<DesktopState> {
  return openNewSession ? client.selectProject(null) : client.getDesktopState();
}
