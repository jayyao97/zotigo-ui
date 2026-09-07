import { currentHost, listHosts, saveHost, deleteHost, testHost, resolveHost } from "./hosts";
import { openDaemonFile, saveDaemonFile, inspectCatalogSource, listDaemonDirectory } from "./zotigod";
import fs from "node:fs";
import path from "node:path";
import { parseMarkdownLink } from "../shared/markdownLinks";
import { decodedBase64Size, maxMessageImageCount, messageImageSizeError } from "../shared/messageImages";
import { imageDownloadUrl } from "./imageDownload";
import {
  createSession,
  getAgents,
  getDaemonConfig,
  getSession,
  getProfiles,
  prepareCodex,
  pauseSession,
  listSkills,
  listSessionItems,
  listSessions,
  sendSessionMessage,
  sendSessionSteering,
  suggestSessionTitle,
  startSession,
  changeSessionApprovalPolicy,
  submitSessionApproval,
  changeSessionCodexSettings,
  changeSessionProfile,
  ZotigodRequestError,
  isMessageDuringActiveTurnError,
  setCatalogSessionPosition,
  setCatalogSessionTitle,
} from "./zotigod";
import type {
  AgentKind,
  ApprovalPolicy,
  ApprovalDecisionInput,
  MessageImageInput,
  SessionCommandResponse,
  ZotigoSession,
} from "../shared/zotigod";
import { parseCreateProjectInput, parseProjectSources } from "./projectInputValidation";
import {
  openAuthorizedLocalPath,
  resolveLocalPathReference,
  saveAuthorizedTextFile,
} from "./localFileService";
import { createCatalogService, type CatalogSelectionStore } from "./catalogService";

import { createSessionEvents } from "./sessionEvents";
import type { SessionEventEnvelope } from "../shared/clientTypes";

export interface NativeServices {
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  downloadImage(url: string): void | Promise<void>;
}

export type ApplicationResult = { ok: true; value: unknown } | { ok: false; error: string };

/** One connection owns one event subscription, independent of other clients. */
export function createApplicationService(platform: NativeServices, sendEvent: (event: SessionEventEnvelope) => void, selection?: CatalogSelectionStore) {
  const {
addWorkspaceSourceToCatalog,
  addSourcesToCatalog,
  archiveCatalogConversation,
  archiveWorkspaceInCatalog,
  createProjectInCatalog,
  createWorkspaceInCatalog,
  deleteWorkspaceInCatalog,
  deleteProjectInCatalog,
  previewProjectDeleteInCatalog,
  getCatalogDesktopState,
  getWorkspaceSourcesFromCatalog,
  pinCatalogConversation,
  previewWorkspaceArchiveInCatalog,
  previewWorkspaceDeleteInCatalog,
  removeSourceFromCatalog,
  renameCatalogConversation,
  renameProjectInCatalog,
  renameWorkspaceInCatalog,
  reorderCatalogPinnedSessions,
  reorderCatalogProjects,
  reorderCatalogWorkspaces,
  reorderCatalogWorkspaceSessions,
  retryWorkspaceInCatalog,
  selectCatalogProject,
  selectCatalogSession,
  selectCatalogWorkspace,
  } = createCatalogService(selection);
  const events = createSessionEvents(sendEvent);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  function handle(channel: string, listener: (...args: unknown[]) => unknown): void {
    handlers.set(channel, listener);
  }
  handle("hosts:list", () => listHosts());
  handle("hosts:save", (input) => saveHost(input as import("../shared/hosts").HostInput));
  handle("hosts:delete", (id) => deleteHost(assertString(id, "id")));
  handle("hosts:test", (id) => testHost(assertString(id, "id")));
  handle("hosts:activate", (id) => { resolveHost(assertString(id, "id")); });
  handle("hosts:inspect", async (paths) => {
    const values = assertStringArray(paths, "paths"); if (values.length > 20) throw new Error("Choose at most 20 folders.");
    return Promise.all(values.map(async (selectedPath) => { const result = await inspectCatalogSource(selectedPath); return { selectedPath, canonicalPath: result.canonical_path, name: result.canonical_path.split(/[\\/]/).pop() || result.canonical_path, kind: result.kind }; }));
  });
  handle("desktop:download-image", (url) => {
    return platform.downloadImage(imageDownloadUrl(assertString(url, "url"), getDaemonConfig().baseUrl));
  });
  handle("daemon:get-config", () => getDaemonConfig());
  handle("daemon:get-profiles", (workingDirectory) =>
    getProfiles(workingDirectory === undefined ? undefined : assertString(workingDirectory, "workingDirectory")),
  );
  handle("daemon:list-skills", (sessionId, forceReload) =>
    listSkills(
      // An omitted positional argument before forceReload is null over JSON.
      sessionId == null ? undefined : assertNonEmptyString(sessionId, "sessionId"),
      forceReload === undefined ? false : assertBoolean(forceReload, "forceReload"),
    ),
  );
  handle("daemon:get-agents", () => getAgents());
  handle("daemon:prepare-codex", () => prepareCodex());
  handle("sessions:list", () => listSessions());
  handle("sessions:get", (id) => getSession(assertString(id, "id")));
  handle("sessions:pause", (id, turnId) =>
    pauseSession(assertString(id, "id"), assertNonEmptyString(turnId, "turnId")),
  );
  handle("sessions:change-profile", (id, profile) =>
    changeSessionProfile(assertString(id, "id"), assertNonEmptyString(profile, "profile")),
  );
  handle("sessions:change-approval-policy", (id, approvalPolicy) =>
    changeSessionApprovalPolicy(
      assertString(id, "id"),
      assertApprovalPolicy(approvalPolicy, "approvalPolicy"),
    ),
  );
  handle("sessions:submit-approval", (id, approvalId, decisions) =>
    submitSessionApproval(
      assertString(id, "id"),
      assertNonEmptyString(approvalId, "approvalId"),
      assertApprovalDecisions(decisions),
    ),
  );
  handle("sessions:change-codex-settings", (id, input) => {
    const value = assertRecord(input, "Codex settings");
    return changeSessionCodexSettings(assertString(id, "id"), {
      model: assertNonEmptyString(value.model, "model"),
      reasoningEffort: assertNonEmptyString(value.reasoningEffort, "reasoningEffort"),
    });
  });
  handle("sessions:list-items", (id, query) =>
    listSessionItems(assertString(id, "id"), assertSessionItemsQuery(query)),
  );
  handle("sessions:subscribe-events", (idValue, afterValue) => {
    const id = assertString(idValue, "id");
    const after = assertOptionalPositiveInteger(afterValue, "after");
    events.start(id, after);
  });
  handle("sessions:unsubscribe-events", () => events.stop());
  handle("desktop:get-state", () => getCatalogDesktopState());
  handle("desktop:sync-state", () => getCatalogDesktopState({ syncCodex: true }));
  handle("desktop:create-project", async (input) => createProjectInCatalog(parseCreateProjectInput(input)));
  handle("desktop:add-project-sources", (projectId, sources) =>
    addSourcesToCatalog(assertNonEmptyString(projectId, "projectId"), parseProjectSources(sources)),
  );
  handle("desktop:remove-project-source", (kind, sourceId) => {
    if (kind !== "git" && kind !== "folder") throw new Error("source kind must be git or folder");
    return removeSourceFromCatalog(assertNonEmptyString(sourceId, "sourceId"));
  });
  handle("desktop:select-project", (id) => selectCatalogProject(assertNullableString(id, "id")));
  handle("desktop:rename-project", (projectId, name) =>
    renameProjectInCatalog(assertNonEmptyString(projectId, "projectId"), assertNonEmptyString(name, "name")),
  );
  handle("desktop:create-workspace", async (input) =>
    createWorkspaceInCatalog(assertCreateWorkspaceInput(input)),
  );
  handle("desktop:get-workspace-sources", (id) =>
    getWorkspaceSourcesFromCatalog(assertNonEmptyString(id, "workspaceId")),
  );
  handle("desktop:add-workspace-source", (id, input) =>
    addWorkspaceSourceToCatalog(assertNonEmptyString(id, "workspaceId"), assertAddWorkspaceSourceInput(input)),
  );
  handle("desktop:retry-workspace", async (id) =>
    retryWorkspaceInCatalog(assertNonEmptyString(id, "workspaceId")),
  );
  handle("desktop:rename-workspace", (id, title) =>
    renameWorkspaceInCatalog(assertNonEmptyString(id, "workspaceId"), assertNonEmptyString(title, "title")),
  );
  handle("desktop:preview-workspace-archive", (id) =>
    previewWorkspaceArchiveInCatalog(assertNonEmptyString(id, "workspaceId")),
  );
  handle("desktop:preview-workspace-delete", (id) =>
    previewWorkspaceDeleteInCatalog(assertNonEmptyString(id, "workspaceId")),
  );
  handle("desktop:preview-project-delete", (id) =>
    previewProjectDeleteInCatalog(assertNonEmptyString(id, "projectId")),
  );
  handle("desktop:delete-project", (input) => {
    const value = assertRecord(input, "delete project input");
    return deleteProjectInCatalog(assertNonEmptyString(value.id, "projectId"), assertString(value.confirmation, "confirmation"));
  });
  handle("desktop:archive-workspace", (id) =>
    archiveWorkspaceInCatalog(assertNonEmptyString(id, "workspaceId")),
  );
  handle("desktop:delete-workspace", (input) => {
    const value = assertRecord(input, "delete workspace input");
    return deleteWorkspaceInCatalog(
      assertNonEmptyString(value.id, "workspaceId"),
      assertString(value.confirmation, "confirmation"),
    );
  });
  handle("desktop:select-workspace", (id) => selectCatalogWorkspace(assertNullableString(id, "id")));
  handle("desktop:select-conversation", (id) => selectCatalogSession(assertNullableString(id, "id")));
  handle("desktop:reveal-path", async (pathValue) => revealRegisteredPath(assertNonEmptyString(pathValue, "path")));
  handle("desktop:list-directory", (input) => {
    const value = assertRecord(input, "directory input");
    if (value.purpose !== "files" && value.purpose !== "sources") throw new Error("Invalid directory purpose.");
    return listDaemonDirectory({ path: assertString(value.path, "path"), purpose: value.purpose, sessionId: value.sessionId === undefined ? undefined : assertString(value.sessionId, "sessionId") });
  });
  handle("desktop:open-text-file", async (pathValue, sessionId) => {
    const requestedPath = assertNonEmptyString(pathValue, "path");
    const id = sessionId === undefined ? undefined : assertString(sessionId, "sessionId");
    const opened = currentHost()?.id && currentHost()?.id !== "local"
      ? await openDaemonFile({ path: requestedPath, sessionId: id })
      : await openAuthorizedLocalPath(requestedPath, await authorizedFileRoots(requestedPath, id));
    if (opened.kind !== "text") throw new Error("This file cannot be previewed as text.");
    return opened.file;
  });
  handle("desktop:open-markdown-link", async (input) => {
    const value = assertOpenMarkdownLinkInput(input);
    const link = parseMarkdownLink(value.href);
    if (link.kind === "anchor") return link;
    if (link.kind === "external") {
      await platform.openExternal(link.url);
      return { kind: "external" } as const;
    }

    if (currentHost()?.id && currentHost()?.id !== "local") {
      const opened = await openDaemonFile({ path: link.path, basePath: value.basePath, baseKind: value.baseKind, sessionId: value.sessionId });
      if (opened.kind === "directory") return opened;
      if (opened.kind !== "text") throw new Error("This remote file cannot be previewed as text.");
      return { kind: "text", file: opened.file, line: link.line, column: link.column } as const;
    }
    const requestedPath = resolveLocalPathReference(link.path, value.basePath, value.baseKind);
    const opened = await openAuthorizedLocalPath(requestedPath, await authorizedFileRoots(requestedPath, value.sessionId));
    if (opened.kind === "directory") return opened;
    if (opened.kind === "system") {
      await platform.openPath(opened.path);
      return { kind: "system" } as const;
    }
    return { kind: "text", file: opened.file, line: link.line, column: link.column } as const;
  });
  handle("desktop:save-text-file", async (input) => {
    const value = assertSaveTextFileInput(input);
    if (currentHost()?.id && currentHost()?.id !== "local") return saveDaemonFile(value);
    return saveAuthorizedTextFile(value, await authorizedFileRoots(value.path, value.sessionId));
  });
  handle("desktop:create-conversation-with-session", async (input) => {
    const conversationInput = assertCreateConversationInput(input);
    if (!conversationInput.prompt && conversationInput.images.length === 0) {
      throw new Error("message requires text or images");
    }
    try {
      const session = await createStartAndMessageSession(
        conversationInput.workspaceId ?? null,
        conversationInput.title,
        conversationInput.prompt,
        conversationInput.images,
        conversationInput.skills,
        conversationInput.profile,
        conversationInput.approvalPolicy,
        conversationInput.agent,
        conversationInput.model,
        conversationInput.reasoningEffort,
      );
      return { state: await getCatalogDesktopState(), ...session };
    } catch (error) {
      return { state: await getCatalogDesktopState(), error: errorMessage(error), errorCode: requestErrorCode(error) };
    }
  });
  handle("desktop:start-conversation-session", async (conversationIdValue) => {
    const conversationId = assertString(conversationIdValue, "conversationId");

    try {
      const session = await getOrCreateStartedSession(conversationId);
      return { state: await getCatalogDesktopState(), session };
    } catch (error) {
      return { state: await getCatalogDesktopState(), error: errorMessage(error), errorCode: requestErrorCode(error) };
    }
  });
  handle("desktop:send-conversation-message", async (input) => {
    const messageInput = assertSendConversationMessageInput(input);
    try {
      const result = await sendConversationMessage(
        messageInput.conversationId,
        messageInput.text,
        messageInput.images,
        messageInput.skills,
        messageInput.approvalPolicy,
      );
      return { state: await getCatalogDesktopState(), ...result };
    } catch (error) {
      return { state: await getCatalogDesktopState(), error: errorMessage(error), errorCode: requestErrorCode(error) };
    }
  });
  handle("desktop:suggest-conversation-title", async (conversationId) => {
    const id = assertString(conversationId, "conversationId");
    const suggestion = await suggestSessionTitle(id);
    await setCatalogSessionTitle(id, suggestion.title);
    return getCatalogDesktopState();
  });
  handle("desktop:rename-conversation", (conversationIdValue, title) => {
    const conversationId = assertString(conversationIdValue, "conversationId");
    return renameCatalogConversation(conversationId, assertNonEmptyString(title, "title"));
  });
  handle("desktop:set-conversation-pinned", (conversationId, pinned) =>
    pinCatalogConversation(assertString(conversationId, "conversationId"), assertBoolean(pinned, "pinned")),
  );
  handle("desktop:reorder-projects", (projectIds) => reorderCatalogProjects(assertStringArray(projectIds, "projectIds")));
  handle("desktop:reorder-workspaces", (projectId, workspaceIds) =>
    reorderCatalogWorkspaces(assertString(projectId, "projectId"), assertStringArray(workspaceIds, "workspaceIds")),
  );
  handle("desktop:reorder-workspace-conversations", (conversationIds) =>
    reorderCatalogWorkspaceSessions(assertStringArray(conversationIds, "conversationIds")),
  );
  handle("desktop:reorder-pinned-conversations", (conversationIds) =>
    reorderCatalogPinnedSessions(assertStringArray(conversationIds, "conversationIds")),
  );
  handle("desktop:archive-conversation", (conversationId) =>
    archiveCatalogConversation(assertString(conversationId, "conversationId")),
  );

async function revealRegisteredPath(requestedPath: string): Promise<void> {
  if (currentHost()?.id && currentHost()?.id !== "local") throw new Error("Remote paths cannot be opened in the local file manager.");
  const resolved = path.resolve(requestedPath);
  if (!fs.existsSync(resolved)) throw new Error("Path does not exist.");
  const state = await getCatalogDesktopState();
  const roots = [
    ...state.repositories.map((repository) => repository.source_path),
    ...state.folders.map((folder) => folder.source_path),
    ...state.workspaces.map((workspace) => workspace.root_path),
  ].filter((value): value is string => Boolean(value));
  if (!roots.some((root) => fs.existsSync(root) && isExistingPathInside(root, resolved))) {
    throw new Error("Path is not owned by a registered Zotigo Project, Workspace, Scratch session, or Source.");
  }
  await platform.openPath(resolved);
}


  function isExistingPathInside(parentPath: string, childPath: string): boolean {
    const parent = fs.realpathSync(parentPath);
    const child = fs.realpathSync(childPath);
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  }

  async function authorizedFileRoots(requestedPath: string, sessionId?: string): Promise<string[]> {
    if (sessionId) {
      const session = await getSession(sessionId);
      if (
        session.working_directory
        && fs.existsSync(session.working_directory)
        && fs.existsSync(requestedPath)
        && isExistingPathInside(session.working_directory, requestedPath)
      ) {
        return [session.working_directory];
      }
    }
    const state = await getCatalogDesktopState();
    const roots = [
      ...state.repositories.map((repository) => repository.source_path),
      ...state.folders.map((folder) => folder.source_path),
      ...state.workspaces.map((workspace) => workspace.root_path),
    ].filter((value): value is string => Boolean(value));
    return roots;
  }

  async function createStartAndMessageSession(
    workspaceId: string | null,
    title: string | undefined,
    text: string,
    images: MessageImageInput[],
    skills: string[],
    profile?: string,
    approvalPolicy?: ApprovalPolicy,
    agent: AgentKind = "zotigo",
    model?: string,
    reasoningEffort?: string,
  ): Promise<{ session: ZotigoSession; command: SessionCommandResponse }> {
    const created = await createSession({
      workspaceId: workspaceId ?? undefined,
      agent,
      ...(agent === "codex"
        ? { model, reasoningEffort }
        : { profile, approvalPolicy }),
    });
    await setCatalogSessionTitle(created.id, title?.trim() || "New session");
    if (workspaceId) {
      await setCatalogSessionPosition(created.id, -Date.now());
    }
    await selectCatalogSession(created.id);
    const started = await startSession(created.id);
    const command = await sendSessionMessage(started.id, text, images, skills);
    return { session: started, command };
  }

  async function sendConversationMessage(
    conversationId: string,
    text: string,
    images: MessageImageInput[],
    skills: string[],
    approvalPolicy?: ApprovalPolicy,
  ): Promise<{ session: ZotigoSession; command: SessionCommandResponse }> {
    let session = await getOrCreateStartedSession(conversationId, approvalPolicy);
    const command = await sendMessageOrSteering(session.id, text, images, skills);
    if (command.type === "steering") {
      return { session, command };
    }
    session = await getSession(session.id);
    return { session, command };
  }

  async function getOrCreateStartedSession(
    conversationId: string,
    approvalPolicy?: ApprovalPolicy,
  ): Promise<ZotigoSession> {
    let session = await getSession(conversationId);
    if (
      session.state === "created"
      || session.state === "offline"
      || (session.state === "failed" && session.error_code === "runtime_occupied")
    ) {
      session = await startSession(session.id);
    }
    if (approvalPolicy && session.approval_policy !== approvalPolicy) {
      await changeSessionApprovalPolicy(session.id, approvalPolicy);
    }
    return session;
  }

  async function sendMessageOrSteering(
    sessionId: string,
    text: string,
    images: MessageImageInput[],
    skills: string[],
  ): Promise<SessionCommandResponse> {
    try {
      return await sendSessionMessage(sessionId, text, images, skills);
    } catch (error) {
      if (isMessageDuringActiveTurnError(error)) {
        return sendSessionSteering(sessionId, text, images, skills);
      }
      throw error;
    }
  }

  return {
    channels: [...handlers.keys()],
    dispose: () => events.stop(),
    async invoke(channel: string, args: unknown[]): Promise<ApplicationResult> {
      const listener = handlers.get(channel);
      if (!listener) return { ok: false, error: "Unknown application operation" };
      try {
        return { ok: true, value: await listener(...args) };
      } catch (error) {
        console.warn("operation_failed operation=%s error_type=%s", channel, error instanceof Error ? error.name : typeof error);
        return { ok: false, error: errorMessage(error) };
      }
    },
  };
}


function assertString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function assertNonEmptyString(value: unknown, name: string): string {
  const text = assertString(value, name).trim();
  if (!text) {
    throw new Error(`${name} is required`);
  }
  return text;
}

function assertNullableString(value: unknown, name: string): string | null {
  if (value === null) {
    return null;
  }
  return assertString(value, name);
}

function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function assertOpenMarkdownLinkInput(value: unknown): {
  href: string;
  basePath: string | null;
  baseKind: "directory" | "file";
  sessionId?: string;
} {
  const input = assertRecord(value, "Markdown link");
  const baseKind = assertString(input.baseKind, "baseKind");
  if (baseKind !== "directory" && baseKind !== "file") {
    throw new Error("baseKind must be directory or file");
  }
  return {
    href: assertNonEmptyString(input.href, "href"),
    basePath: assertNullableString(input.basePath, "basePath"),
    baseKind,
    sessionId: input.sessionId === undefined ? undefined : assertNonEmptyString(input.sessionId, "sessionId"),
  };
}

function assertSaveTextFileInput(value: unknown): {
  path: string;
  content: string;
  expectedMtimeMs: number;
  sessionId?: string;
} {
  const input = assertRecord(value, "text file save");
  return {
    path: assertNonEmptyString(input.path, "path"),
    content: assertString(input.content, "content"),
    expectedMtimeMs: assertNumber(input.expectedMtimeMs, "expectedMtimeMs"),
    sessionId: input.sessionId === undefined ? undefined : assertNonEmptyString(input.sessionId, "sessionId"),
  };
}

function assertOptionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function assertCreateWorkspaceInput(value: unknown): {
  projectId: string;
  title: string;
  branchName?: string;
  repositories: Array<{ repositoryId: string; baseRef: string }>;
  folders: Array<{ folderId: string; mode?: "direct" | "reference" | "copy" }>;
} {
  const record = assertRecord(value, "create workspace input");
  return {
    projectId: assertNonEmptyString(record.projectId, "projectId"),
    title: assertNonEmptyString(record.title, "workspace title"),
    branchName: optionalTrimmedString(record.branchName, "branchName"),
    repositories: assertArray(record.repositories, "repositories").map((item, index) => {
      const repository = assertRecord(item, `repositories[${index}]`);
      return {
        repositoryId: assertNonEmptyString(repository.repositoryId, `repositories[${index}].repositoryId`),
        baseRef: assertNonEmptyString(repository.baseRef, `repositories[${index}].baseRef`),
      };
    }),
    folders: assertArray(record.folders, "folders").map((item, index) => {
      const folder = assertRecord(item, `folders[${index}]`);
      const mode = folder.mode === undefined ? undefined : assertString(folder.mode, `folders[${index}].mode`);
      if (mode !== undefined && mode !== "direct" && mode !== "reference" && mode !== "copy") throw new Error("folder mode is invalid");
      return { folderId: assertNonEmptyString(folder.folderId, `folders[${index}].folderId`), mode };
    }),
  };
}

function assertAddWorkspaceSourceInput(value: unknown): {
  sourceId: string;
  mode?: "direct" | "reference" | "copy";
  baseRef?: string;
  branchName?: string;
} {
  const record = assertRecord(value, "add workspace source input");
  const mode = record.mode === undefined ? undefined : assertString(record.mode, "mode");
  if (mode !== undefined && mode !== "direct" && mode !== "reference" && mode !== "copy") {
    throw new Error("workspace source mode is invalid");
  }
  return {
    sourceId: assertNonEmptyString(record.sourceId, "sourceId"),
    mode,
    baseRef: optionalTrimmedString(record.baseRef, "baseRef"),
    branchName: optionalTrimmedString(record.branchName, "branchName"),
  };
}

function optionalTrimmedString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return assertString(value, name).trim() || undefined;
}

function assertCreateConversationInput(value: unknown): {
  projectId: string | null;
  workspaceId: string | null;
  title?: string;
  prompt: string;
  images: MessageImageInput[];
  skills: string[];
  profile?: string;
  approvalPolicy?: ApprovalPolicy;
  agent?: AgentKind;
  model?: string;
  reasoningEffort?: string;
} {
  const record = assertRecord(value, "create conversation input");
  return {
    projectId: assertNullableString(record.projectId, "projectId"),
    workspaceId:
      record.workspaceId === undefined ? null : assertNullableString(record.workspaceId, "workspaceId"),
    title: record.title === undefined ? undefined : assertString(record.title, "title"),
    prompt: record.prompt === undefined ? "" : assertString(record.prompt, "prompt").trim(),
    images: assertMessageImages(record.images),
    skills: assertSkillNames(record.skills),
    profile: record.profile === undefined ? undefined : assertNonEmptyString(record.profile, "profile"),
    approvalPolicy:
      record.approvalPolicy === undefined
        ? undefined
        : assertApprovalPolicy(record.approvalPolicy, "approvalPolicy"),
    agent: record.agent === undefined ? undefined : assertAgentKind(record.agent, "agent"),
    model: record.model === undefined ? undefined : assertNonEmptyString(record.model, "model"),
    reasoningEffort:
      record.reasoningEffort === undefined
        ? undefined
        : assertNonEmptyString(record.reasoningEffort, "reasoningEffort"),
  };
}

function assertAgentKind(value: unknown, name: string): AgentKind {
  const agent = assertString(value, name);
  if (agent !== "zotigo" && agent !== "codex") {
    throw new Error(`${name} must be zotigo or codex`);
  }
  return agent;
}

function assertApprovalPolicy(value: unknown, name: string): ApprovalPolicy {
  const policy = assertString(value, name);
  if (policy !== "auto" && policy !== "bypass_permissions") {
    throw new Error(`${name} must be auto or bypass_permissions`);
  }
  return policy;
}

function assertSendConversationMessageInput(value: unknown): {
  conversationId: string;
  text: string;
  images: MessageImageInput[];
  skills: string[];
  approvalPolicy?: ApprovalPolicy;
} {
  const record = assertRecord(value, "send conversation message input");
  const images = assertMessageImages(record.images);
  const text = assertString(record.text, "text").trim();
  if (!text && images.length === 0) {
    throw new Error("message requires text or images");
  }
  return {
    conversationId: assertString(record.conversationId, "conversationId"),
    text,
    images,
    skills: assertSkillNames(record.skills),
    approvalPolicy:
      record.approvalPolicy === undefined
        ? undefined
        : assertApprovalPolicy(record.approvalPolicy, "approvalPolicy"),
  };
}

function assertMessageImages(value: unknown): MessageImageInput[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("images must be an array");
  }
  if (value.length > maxMessageImageCount) {
    throw new Error(`A message can include at most ${maxMessageImageCount} images.`);
  }
  const images = value.map((image, index) => {
    const record = assertRecord(image, `images[${index}]`);
    const mimeType = assertString(record.mime_type, `images[${index}].mime_type`);
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
      throw new Error("images must be PNG, JPEG, or WebP");
    }
    return {
      mime_type: mimeType,
      data_base64: assertNonEmptyString(record.data_base64, `images[${index}].data_base64`),
    };
  });
  const sizeError = messageImageSizeError(images.map((image) => decodedBase64Size(image.data_base64)));
  if (sizeError) throw new Error(sizeError);
  return images;
}

function assertSkillNames(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return assertStringArray(value, "skills").map((name, index) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error(`skills[${index}] must not be empty`);
    return trimmed;
  });
}

function assertApprovalDecisions(value: unknown): ApprovalDecisionInput[] {
  const decisions = assertArray(value, "decisions");
  if (decisions.length === 0) throw new Error("decisions must not be empty");
  return decisions.map((item, index) => {
    const record = assertRecord(item, `decisions[${index}]`);
    return {
      tool_call_id: assertNonEmptyString(record.tool_call_id, `decisions[${index}].tool_call_id`),
      approved: assertBoolean(record.approved, `decisions[${index}].approved`),
      reason: optionalTrimmedString(record.reason, `decisions[${index}].reason`),
    };
  });
}

function assertSessionItemsQuery(value: unknown): { limit?: number; after?: number; before?: number } {
  if (value === undefined || value === null) {
    return {};
  }
  const record = assertRecord(value, "session items query");
  return {
    limit: record.limit === undefined ? undefined : assertPositiveInteger(record.limit, "limit"),
    after: record.after === undefined ? undefined : assertPositiveInteger(record.after, "after"),
    before: record.before === undefined ? undefined : assertPositiveInteger(record.before, "before"),
  };
}

function assertPositiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function assertArray(value: unknown, name: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function assertStringArray(value: unknown, name: string): string[] {
  return assertArray(value, name).map((item, index) => assertNonEmptyString(item, `${name}[${index}]`));
}

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function requestErrorCode(error: unknown): string | undefined {
  return error instanceof ZotigodRequestError ? error.code : undefined;
}
