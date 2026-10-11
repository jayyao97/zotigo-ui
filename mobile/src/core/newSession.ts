import type {
  AgentKind,
  CatalogWorkspace,
  ProfilesResponse,
} from "@zotigo/shared/zotigod";
/** Profile names are directory-scoped: an older directory result cannot authorize creation. */
export function sessionContextReady(
  workspace: CatalogWorkspace | undefined,
  agent: AgentKind,
  profiles: ProfilesResponse | undefined,
  profilesDirectory: string | undefined,
  profile: string,
): boolean {
  if (!workspace || workspace.status !== "ready") return false;
  return (
    agent === "codex" ||
    (!!profiles &&
      profilesDirectory === workspace.root_path &&
      profiles.profiles.some((value) => value.name === profile))
  );
}
