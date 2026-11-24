import { setCatalogSelection } from "./preferencesStore";
import { queryCatalogSessions, getUsageActivity } from "./zotigod";
import { getUsageSessions } from "./usageService";
import { parseUsageQuery, parseUsageSessionsQuery } from "../shared/usage";
import { parseMessageFiles, type MessageFileInput } from "../shared/messageFiles";
import { createFileEvents } from "./fileEvents";
import { parseModelSettingsChange } from "../shared/modelSettings";
import { getModelSettings, updateModelSettings, testModelSettings } from "./zotigod";
import { updateDaemon } from "./zotigod";
import { parseUpdateRequest, type UpdateAction, type UpdateChannel, type UpdateStatus } from "../shared/updates";
import { parseWatchedFiles, type FileEventEnvelope } from "../shared/fileEvents";
import { currentHost, listHosts, saveHost, deleteHost, testHost, resolveHost, withHost } from "./hosts";
import { previewDaemonImage, openDaemonFile, saveDaemonFile, inspectCatalogSource, listDaemonDirectory } from "./zotigod";
import fs from "node:fs";
import path from "node:path";
import { parseMarkdownLink } from "../shared/markdownLinks";
import { imageDownloadUrl } from "./imageDownload";
import {
  createSession,
  listManagedRepositories,
  listRepositoryBranches,
  createManagedRepository,
  uploadMessageFiles,
  uploadMessageFile,
  forkSession,
  getAgents,
  getDaemonConfig,
  getSession,
  getProfiles,
  prepareCodex,
  pauseSession,
  listSkills,
  listSessionItems,
  searchSession,
  getSessionItemWindow,
  listSessions,
  sendSessionMessage,
  queueSessionMessage,
  listQueuedInputs,
  listCompletionTriggers,
  cancelCompletionTrigger,
  changeQueuedInput,
  resumeInputQueue,
  sendQueuedInput,
  sendSessionSteering,
  suggestSessionTitle,
  translateSelection,
  startSession,
  changeSessionApprovalPolicy,
  submitSessionApproval,
  submitSessionInteraction,
  changeSessionCodexSettings,
  changeSessionProfile,
  ZotigodRequestError,
  inputDeliveryFailure,
  isMessageDuringActiveTurnError,
  setCatalogSessionPosition,
  parseNavigationItem,
  setCatalogSessionTitle,
  setSessionReadState,
	listChannelConnections,
	createChannelConnection,
	updateChannelConnection,
	deleteChannelConnection,
	listChannelGroups,
	listChannelGroupMembers,
	listChannelConversations,
	updateChannelConversation,
	listChannelMessages,
} from "./zotigod";
import { createFirstMessageDeliveries } from "./firstMessageDeliveries";
import type {
  ApprovalPolicy,
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
import { projectSessionRows, createCatalogService, type CatalogSelectionStore } from "./catalogService";

import { createSessionEvents } from "./sessionEvents";
import type { SessionEventEnvelope } from "../shared/clientTypes";
import {
  assertString,
  assertNonEmptyString,
  assertNullableString,
  assertBoolean,
  assertOpenMarkdownLinkInput,
  assertSaveTextFileInput,
  assertOptionalPositiveInteger,
  assertCreateWorkspaceInput,
  assertAddWorkspaceSourceInput,
  optionalTrimmedString,
  assertCreateConversationInput,
  assertFirstMessageInput,
  assertApprovalPolicy,
  assertSendConversationMessageInput,
  assertApprovalDecisions,
  assertInteractionAnswers,
  assertChannelConnectionInput,
  assertChannelConversationInput,
  assertSessionItemsQuery,
  assertStringArray,
  assertRecord,
} from "./applicationInput";

export interface NativeServices {
  updateClient?(action: UpdateAction, channel?: UpdateChannel): Promise<UpdateStatus>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  downloadImage(url: string): void | Promise<void>;
}

export type ApplicationResult = { ok: true; value: unknown } | { ok: false; error: string };

/** One connection owns one event subscription, independent of other clients. */
export function createApplicationService(platform: NativeServices, sendEvent: (event: SessionEventEnvelope) => void, selection?: CatalogSelectionStore, sendFileEvent: (event: FileEventEnvelope) => void = () => {}) {
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
  reorderCatalogPinnedItems,
  pinCatalogNavigation,
  reorderCatalogProjects,
  reorderCatalogWorkspaces,
  reorderCatalogWorkspaceSessions,
  retryWorkspaceInCatalog,
  selectCatalogProject,
  selectCatalogSession,
  selectCatalogWorkspace,
  } = createCatalogService(selection);
  const events = createSessionEvents(sendEvent);
  const fileEvents = createFileEvents(sendFileEvent);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  function handle(channel: string, listener: (...args: unknown[]) => unknown): void {
    handlers.set(channel, listener);
  }
  const firstMessages = createFirstMessageDeliveries({
    upload: (message) => uploadMessageFiles(message.conversationId, message.text, message.files),
    async send(message, text) {
      let session = await getOrCreateStartedSession(message.conversationId);
      const command = await sendMessageOrSteering(session.id, text, message.images, message.skills, message.clientMessageId);
      if (command.type !== "steering") session = await refreshSentSession(session);
      return { session, command };
    },
    // A failed upload happens before any message is sent.
    failure: (error, stage) => ({ error: errorMessage(error), errorCode: requestErrorCode(error), deliveryState: stage === "upload" ? "rejected" : inputDeliveryFailure(error) }),
  });
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
  // Settings can address a saved host without changing workbench selection.
  const settingsHost = <T>(hostId: unknown, run: () => T): T => hostId === undefined || hostId === null
    ? run() : withHost(assertNonEmptyString(hostId, "hostId"), run);
  handle("daemon:get-model-settings", (hostId) => settingsHost(hostId, () => getModelSettings()));
  handle("updates:component", (target, action, channel, hostId) => {
    const request = parseUpdateRequest(action, channel);
    if (target === "daemon") return settingsHost(hostId, () => updateDaemon(request.action, request.channel));
    if (target !== "client") throw new Error("Invalid update target");
    if (!platform.updateClient) throw new Error("Client updates are unavailable in this installation.");
    return platform.updateClient(request.action, request.channel);
  });
  handle("daemon:update-model-settings", (change, hostId) => settingsHost(hostId, () => updateModelSettings(parseModelSettingsChange(change))));
  handle("daemon:test-model-settings", (change, hostId) => settingsHost(hostId, () => testModelSettings(parseModelSettingsChange(change))));
  handle("desktop:upload-attachment", (sessionId, input) => {
    const [file] = parseMessageFiles([input]);
    return uploadMessageFile(assertNonEmptyString(sessionId, "sessionId"), file);
  });
  handle("daemon:get-profiles", (workingDirectory, scope, hostId) => {
    if (scope != null && scope !== "global") throw new Error("Invalid profile scope.");
    if (scope === "global" && workingDirectory != null) throw new Error("Global profiles cannot include a working directory.");
    return settingsHost(hostId, () => getProfiles(workingDirectory == null ? undefined : assertString(workingDirectory, "workingDirectory"), scope ?? undefined));
  });
  handle("daemon:list-skills", (sessionId, forceReload) =>
    listSkills(
      // An omitted positional argument before forceReload is null over JSON.
      sessionId == null ? undefined : assertNonEmptyString(sessionId, "sessionId"),
      forceReload === undefined ? false : assertBoolean(forceReload, "forceReload"),
    ),
  );
  handle("daemon:get-agents", (hostId) => settingsHost(hostId, getAgents));
  handle("daemon:prepare-codex", (hostId) => settingsHost(hostId, prepareCodex));
	handle("channels:list-connections", () => listChannelConnections());
  handle("usage:activity", (query) => getUsageActivity(parseUsageQuery(query)));
  handle("usage:sessions", (query) => getUsageSessions(parseUsageSessionsQuery(query)));
	handle("channels:create-connection", (input) => createChannelConnection(assertChannelConnectionInput(input)));
	handle("channels:update-connection", (id, input) => updateChannelConnection(assertNonEmptyString(id, "id"), assertChannelConnectionInput(input)));
	handle("channels:delete-connection", (id) => deleteChannelConnection(assertNonEmptyString(id, "id")));
	handle("channels:list-groups", (connectionId) => listChannelGroups(assertNonEmptyString(connectionId, "connectionId")));
	handle("channels:list-group-members", (connectionId, chatId) => listChannelGroupMembers(assertNonEmptyString(connectionId, "connectionId"), assertNonEmptyString(chatId, "chatId")));
	handle("channels:list-conversations", (connectionId) => listChannelConversations(connectionId == null ? undefined : assertNonEmptyString(connectionId, "connectionId")));
	handle("channels:update-conversation", (id, input) => updateChannelConversation(assertNonEmptyString(id, "id"), assertChannelConversationInput(input)));
	handle("channels:list-messages", (id) => listChannelMessages(assertNonEmptyString(id, "id")));
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
  handle("sessions:submit-interaction", (id, interactionId, answers) =>
    submitSessionInteraction(
      assertString(id, "id"),
      assertNonEmptyString(interactionId, "interactionId"),
      assertInteractionAnswers(answers),
    ),
  );
  handle("sessions:change-codex-settings", (id, input) => {
    const value = assertRecord(input, "Codex settings");
    return changeSessionCodexSettings(assertString(id, "id"), {
      model: assertNonEmptyString(value.model, "model"),
      reasoningEffort: assertNonEmptyString(value.reasoningEffort, "reasoningEffort"),
    });
  });
  handle("sessions:search", (id, query) => {
    const text = assertString(query, "query");
    if (!text.trim() || [...text].length > 256) throw new Error("Search supports up to 256 characters");
    return searchSession(assertString(id, "id"), text);
  });
  handle("sessions:item-window", (id, target) => getSessionItemWindow(assertString(id, "id"), typeof target === "number" ? assertOptionalPositiveInteger(target, "sequence")! : assertNonEmptyString(target, "messageId")));
  handle("sessions:list-items", (id, query) =>
    listSessionItems(assertString(id, "id"), assertSessionItemsQuery(query)),
  );
  handle("sessions:subscribe-events", (idValue, afterValue) => {
    const id = idValue === null ? null : assertString(idValue, "id");
    const after = assertOptionalPositiveInteger(afterValue, "after");
    events.start(id, after);
  });
  handle("sessions:unsubscribe-events", id => events.stop(id == null ? id : assertString(id, "id")));
  handle("files:subscribe-events", (id, files) => fileEvents.start(assertString(id, "subscriptionId"), parseWatchedFiles(files)));
  handle("files:unsubscribe-events", () => fileEvents.stop());
  handle("desktop:query-sessions", async input => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid session query");
    const page = await queryCatalogSessions(input as import("../shared/clientTypes").SessionQuery);
    return { ...projectSessionRows(page.sessions), nextCursor: page.nextCursor };
  });
  handle("desktop:save-selection", async input => {
    const value = input as { projectId: string | null; workspaceId: string | null; sessionId: string | null };
    const next = {projectId: assertNullableString(value.projectId, "projectId"), workspaceId: assertNullableString(value.workspaceId, "workspaceId"), sessionId: assertNullableString(value.sessionId, "sessionId")};
    if (selection) selection.setCatalogSelection(next); else setCatalogSelection(next);
  });
  handle("desktop:get-state", () => getCatalogDesktopState());
  handle("desktop:sync-state", () => getCatalogDesktopState({ syncCodex: true }));
  handle("desktop:create-project", async (input) => createProjectInCatalog(parseCreateProjectInput(input)));
  handle("repositories:list", () => listManagedRepositories());
  handle("repositories:branches", (projectId, sourceId, refresh) => listRepositoryBranches(assertNonEmptyString(projectId, "projectId"), assertNonEmptyString(sourceId, "sourceId"), refresh === undefined ? false : assertBoolean(refresh, "refresh")));
  handle("repositories:create", (input) => {
    const record = assertRecord(input, "repository input");
    return createManagedRepository({
      remoteUrl: assertNonEmptyString(record.remoteUrl, "remoteUrl"),
      name: optionalTrimmedString(record.name, "name"),
    });
  });
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
  const openFile = async (pathValue: unknown, sessionId: unknown) => {
    const requestedPath = assertNonEmptyString(pathValue, "path");
    const id = sessionId === undefined ? undefined : assertString(sessionId, "sessionId");
    const opened = currentHost()?.id && currentHost()?.id !== "local"
      ? await openDaemonFile({ path: requestedPath, sessionId: id })
      : await openAuthorizedLocalPath(requestedPath, await authorizedFileRoots(requestedPath, id));
    if (opened.kind !== "text" && opened.kind !== "image" && opened.kind !== "video") throw new Error("This file cannot be previewed.");
    return opened;
  };
  handle("desktop:open-file", openFile);
  handle("desktop:open-text-file", async (pathValue, sessionId) => {
    const opened = await openFile(pathValue, sessionId);
    if (opened.kind !== "text") throw new Error("This file cannot be previewed as text.");
    return opened.file;
  });
  handle("desktop:preview-image", async (input) => {
    const value = assertOpenMarkdownLinkInput(input);
    const explicitOpen = (input as { explicitOpen?: unknown }).explicitOpen;
    if (explicitOpen !== undefined && typeof explicitOpen !== "boolean") throw new Error("Invalid preview intent.");
    const link = parseMarkdownLink(value.href);
    if (link.kind !== "local") throw new Error("Expected a file image path.");
    return previewDaemonImage({ path: link.path, basePath: value.basePath, baseKind: value.baseKind, sessionId: value.sessionId, imageOnly: true, explicitOpen: explicitOpen === true });
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
      const opened = await openDaemonFile({ path: link.path, basePath: value.basePath, baseKind: value.baseKind, sessionId: value.sessionId, explicitOpen: true });
      if (opened.kind === "directory") return opened;
      if (opened.kind === "image" || opened.kind === "video") return opened;
      if (opened.kind !== "text") throw new Error("This remote file cannot be previewed.");
      return { kind: "text", file: opened.file, line: link.line, column: link.column } as const;
    }
    const requestedPath = resolveLocalPathReference(link.path, value.basePath, value.baseKind);
    const opened = await openAuthorizedLocalPath(requestedPath, [path.parse(requestedPath).root]);
    if (opened.kind === "directory") return opened;
    if (opened.kind === "system") throw new Error("This file cannot be previewed.");
    if (opened.kind === "image" || opened.kind === "video") return opened;
    const roots = await authorizedFileRoots(requestedPath, value.sessionId);
    const insideRoots = roots.some((root) => fs.existsSync(root) && isExistingPathInside(root, opened.file.path));
    return { kind: "text", file: { ...opened.file, readOnly: opened.file.readOnly || !insideRoots }, line: link.line, column: link.column } as const;
  });
  handle("desktop:save-text-file", async (input) => {
    const value = assertSaveTextFileInput(input);
    if (currentHost()?.id && currentHost()?.id !== "local") return saveDaemonFile(value);
    return saveAuthorizedTextFile(value, await authorizedFileRoots(value.path, value.sessionId));
  });
  // Creation returns before the worker starts so navigation shows the session
  // immediately. The first message is delivered here in the background, under
  // this request's host, so it does not depend on the page that submitted it.
  handle("desktop:create-conversation", async (input) => {
    const conversationInput = assertCreateConversationInput(input);
    let session: Awaited<ReturnType<typeof createSession>>;
    try {
      session = await createSession({
        workspaceId: conversationInput.workspaceId ?? undefined,
        agent: conversationInput.agent ?? "zotigo",
        approvalPolicy: conversationInput.approvalPolicy,
        ...(conversationInput.agent === "codex"
          ? { model: conversationInput.model, reasoningEffort: conversationInput.reasoningEffort }
          : { profile: conversationInput.profile }),
      });
    } catch (error) {
      return { state: await getCatalogDesktopState(), error: errorMessage(error), errorCode: requestErrorCode(error), deliveryState: inputDeliveryFailure(error) };
    }
    // The session exists: its first message goes out even if a catalog step below fails.
    if (conversationInput.message) firstMessages.start({ ...conversationInput.message, conversationId: session.id });
    try {
      await setCatalogSessionTitle(session.id, conversationInput.title?.trim() || "New session");
      if (conversationInput.workspaceId && session.workspace_position === undefined) {
        await setCatalogSessionPosition(session.id, -Date.now());
      }
      return { state: await selectCatalogSession(session.id), session };
    } catch (error) {
      return { state: await getCatalogDesktopState(), session, error: errorMessage(error), errorCode: requestErrorCode(error) };
    }
  });
  handle("desktop:wait-first-message", (clientMessageId) => firstMessages.wait(assertNonEmptyString(clientMessageId, "clientMessageId")));
  handle("desktop:retry-first-message", (input) => firstMessages.retry(assertFirstMessageInput(input)));
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
        messageInput.clientMessageId,
        messageInput.files,
        messageInput.mode,
      );
      return { ...result };
    } catch (error) {
      return { error: errorMessage(error), errorCode: requestErrorCode(error), deliveryState: inputDeliveryFailure(error) };
    }
  });
  handle("sessions:translate", (id, text, language, profile) => {
    const target = assertNonEmptyString(language, "targetLanguage");
    const source = assertNonEmptyString(text, "text");
    if (!["zh-CN", "en"].includes(target) || [...source].length > 8000) throw new Error("Invalid translation input");
    return translateSelection(assertNonEmptyString(id, "sessionId"), source, target, profile == null ? undefined : assertString(profile, "profile"));
  });
  handle("sessions:queue-list", id => listQueuedInputs(assertNonEmptyString(id, "sessionId")));
  handle("sessions:completion-list", (id, targetId) => listCompletionTriggers(assertNonEmptyString(id, "sessionId"), targetId === undefined ? undefined : assertNonEmptyString(targetId, "triggerId")));
  handle("sessions:completion-cancel", (id, triggerId) => cancelCompletionTrigger(assertNonEmptyString(id, "sessionId"), assertNonEmptyString(triggerId, "triggerId")));
  handle("sessions:queue-resume", id => resumeInputQueue(assertNonEmptyString(id, "sessionId")));
  for (const operation of ["edit", "delete", "send"] as const) {
    handle(`sessions:queue-${operation}`, (id, itemId, revision, text, imageIndices) => {
      if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid queue revision");
      if (operation === "send") return sendQueuedInput(assertNonEmptyString(id, "sessionId"), assertNonEmptyString(itemId, "itemId"), revision);
      if (imageIndices !== undefined && (!Array.isArray(imageIndices) || !imageIndices.every(index => typeof index === "number" && Number.isSafeInteger(index) && index >= 0))) throw new Error("Invalid image indices");
      return changeQueuedInput(assertNonEmptyString(id, "sessionId"), assertNonEmptyString(itemId, "itemId"), revision, operation === "edit" ? assertString(text, "text") : undefined, imageIndices as number[] | undefined);
    });
  }
  handle("desktop:suggest-conversation-title", async (conversationId) => {
    const id = assertString(conversationId, "conversationId");
    const suggestion = await suggestSessionTitle(id);
    await setCatalogSessionTitle(id, suggestion.title);
    return getCatalogDesktopState();
  });
  handle("sessions:set-read-state", (id, readVersion) => {
    if (readVersion !== null && (typeof readVersion !== "number" || !Number.isSafeInteger(readVersion) || readVersion < 0)) throw new Error("Invalid read version");
    return setSessionReadState(assertNonEmptyString(id, "sessionId"), readVersion as number | null);
  });
  handle("desktop:rename-conversation", (conversationIdValue, title) => {
    const conversationId = assertString(conversationIdValue, "conversationId");
    return renameCatalogConversation(conversationId, assertNonEmptyString(title, "title"));
  });
  handle("desktop:fork-conversation", async (conversationId, requestId, throughTurnId) => {
    const session = await forkSession(
      assertNonEmptyString(conversationId, "conversationId"),
      assertNonEmptyString(requestId, "requestId"),
      throughTurnId === undefined ? undefined : assertNonEmptyString(throughTurnId, "throughTurnId"),
    );
    return { state: await getCatalogDesktopState(), session };
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
  handle("desktop:set-navigation-pinned", (item, pinned) =>
    pinCatalogNavigation(parseNavigationItem(item), assertBoolean(pinned, "pinned")),
  );
  handle("desktop:reorder-pinned-items", (items) => {
    if (!Array.isArray(items)) throw new Error("Expected navigation items");
    return reorderCatalogPinnedItems(items.map(parseNavigationItem));
  });
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

  async function sendConversationMessage(
    conversationId: string,
    text: string,
    images: MessageImageInput[],
    skills: string[],
    approvalPolicy?: ApprovalPolicy,
    clientMessageId?: string,
    files: MessageFileInput[] = [],
    mode: "steering" | "queue" = "steering",
  ): Promise<{ session: ZotigoSession; command: SessionCommandResponse }> {
    text = await uploadMessageFiles(conversationId, text, files);
    let session = await getOrCreateStartedSession(conversationId, approvalPolicy);
    const command = mode === "queue" ? await queueSessionMessage(session.id, text, images, skills, clientMessageId) : await sendMessageOrSteering(session.id, text, images, skills, clientMessageId);
    if (command.type === "steering") {
      return { session, command };
    }
    return { session: await refreshSentSession(session), command };
  }

  /**
   * Reads a session's state after the daemon accepted a message. The command is
   * already confirmed, so a failed read keeps the earlier state instead of turning
   * the delivery into an error that would invite a resend.
   */
  async function refreshSentSession(session: ZotigoSession): Promise<ZotigoSession> {
    try {
      return await getSession(session.id);
    } catch {
      return session;
    }
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
    clientMessageId?: string,
  ): Promise<SessionCommandResponse> {
    try {
      return await sendSessionMessage(sessionId, text, images, skills, clientMessageId);
    } catch (error) {
      if (isMessageDuringActiveTurnError(error)) {
        return sendSessionSteering(sessionId, text, images, skills, clientMessageId);
      }
      throw error;
    }
  }

  return {
    channels: [...handlers.keys()],
    dispose: () => { events.stop(); fileEvents.stop(); },
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


function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function requestErrorCode(error: unknown): string | undefined {
  return error instanceof ZotigodRequestError ? error.code : undefined;
}
