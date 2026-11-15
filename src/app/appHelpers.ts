import { getLocale, t } from "../../shared/i18n/index";
import type { ApprovalPolicy, CatalogWorkspaceSource, FolderSourceMode, ZotigoSession } from "../../shared/zotigod";
import type { DaemonSessionBinding, DesktopConversation, DesktopProject, ProjectSourceInput } from "../../shared/clientTypes";
import { mergeReadState } from "../unreadSessions";
import type { ConnectionState, ProjectSourceDraft } from "./appTypes";

export function isMarkdownFile(filePath: string): boolean {
  return /\.(?:md|markdown|mdown|mkd)$/i.test(filePath);
}

export function isNearScrollBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

export function workspaceSourceName(binding: CatalogWorkspaceSource): string {
  const parts = binding.source.canonical_path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? binding.source.source_key;
}

export function pathJoinForUi(root: string, child: string): string {
  return `${root.replace(/\/$/, "")}/${child}`;
}

export function fileNameForPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

export function folderModeLabel(mode: FolderSourceMode): string {
  if (mode === "copy") return t("app.independentCopyByDefault");
  if (mode === "reference") return t("app.referenceByDefault");
  return t("app.directByDefault");
}

export function projectSourceInput(draft: ProjectSourceDraft): ProjectSourceInput {
  return {
    path: draft.candidate.selectedPath,
    ...(draft.candidate.kind === "folder" ? { folderMode: draft.folderMode } : {}),
  };
}

export function connectionLabel(state: ConnectionState): string {
  if (state === "checking") {
    return t("app.checking2");
  }
  return state === "online" ? t("app.online") : t("app.offline");
}

export function projectForConversation(conversation: DesktopConversation, projects: DesktopProject[]): DesktopProject | null {
  if (!conversation.project_id) {
    return null;
  }
  return projects.find((project) => project.id === conversation.project_id) ?? null;
}

export function sessionFromBinding(binding: DaemonSessionBinding): ZotigoSession {
  const state = binding.state ?? "created";
  return {
    id: binding.daemon_session_id,
    state,
    live: state !== "offline",
    working: false,
    created_at: binding.daemon_created_at ?? binding.created_at,
    started_at: binding.daemon_started_at,
    ended_at: binding.daemon_ended_at,
    error: binding.error,
  };
}

export function clearResolvedApprovalPolicyOverrides(
  overrides: Record<string, ApprovalPolicy>,
  sessions: ZotigoSession[],
): Record<string, ApprovalPolicy> {
  let next = overrides;
  for (const session of sessions) {
    const override = next[session.id];
    const abandoned = session.state === "offline" || session.state === "ended" || session.state === "failed";
    if (!override || (session.approval_policy !== override && !abandoned)) {
      continue;
    }
    if (next === overrides) {
      next = { ...overrides };
    }
    delete next[session.id];
  }
  return next;
}

export function upsertSession(sessions: ZotigoSession[], session: ZotigoSession): ZotigoSession[] {
  if (sessions.some((current) => current.id === session.id)) {
    return sessions.map((current) => (current.id === session.id ? { ...session, read_state: mergeReadState(current.read_state, session.read_state) } : current));
  }
  return [session, ...sessions];
}

export function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(getLocale(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
