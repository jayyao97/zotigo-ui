import { parseModelSettings, parseModelSettingsChange, type ModelSettingsChange, type ModelTestResult } from "@zotigo/shared/modelSettings";
import { mergeReadState } from "@zotigo/shared/sessionReadState";
import {
  parseMessageFiles,
  type MessageFileInput,
} from "@zotigo/shared/messageFiles";
import type * as D from "@zotigo/shared/zotigod";
import type {
  DirectoryListing,
  ClientApi, ManagedRepository, RepositoryBranch,
  TextFileSnapshot,
  ImageFileSnapshot,
  VideoFileSnapshot,
  SaveTextFileInput,
} from "@zotigo/shared/clientTypes";
import type {
  ChannelConnection,
  ChannelConversation,
  ChannelMessage,
} from "@zotigo/shared/channels";

export interface Host {
  id: string;
  name: string;
  baseUrl: string;
}
export interface Connection extends Host {
  token: string;
}
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type OpenFile =
  | { kind: "text"; file: TextFileSnapshot }
  | { kind: "image"; file: ImageFileSnapshot }
  | { kind: "video"; file: VideoFileSnapshot }
  | { kind: "directory" | "system"; path: string }
  | { kind: "requires_confirmation" };
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
/** The origin of a typed address, or undefined while it is not a valid one yet. Never throws. */
export function addressOrigin(input: string): string | undefined {
  try {
    return normalizeAddress(input);
  } catch {
    return undefined;
  }
}
export function normalizeAddress(input: string): string {
  let url: URL | undefined;
  try {
    url = new URL(input.trim());
  } catch {
    url = undefined;
  }
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "Enter an HTTP(S) daemon origin without a path, credentials, or query.",
    );
  }
  return url.origin;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid daemon response.");
  return value as Record<string, unknown>;
}
const enc = encodeURIComponent;
export class DaemonClient {
  private readStates = new Map<string, D.SessionReadState>();
  private mergeSessionReadState(session: D.ZotigoSession) {
    const read_state = mergeReadState(
      this.readStates.get(session.id),
      session.read_state,
    );
    if (read_state) this.readStates.set(session.id, read_state);
    return { ...session, read_state };
  }
  setSessionReadState = async (id: string, version: number | null) => {
    const state = await this.request<D.SessionReadState>(
      `/sessions/${enc(id)}/read-state`,
      "PUT",
      version === null ? { unread: true } : { read_version: version },
    );
    const merged = mergeReadState(this.readStates.get(id), state)!;
    this.readStates.set(id, merged);
    return merged;
  };
  readonly connection: Readonly<Connection>;
  private lifetime = new AbortController();
  constructor(
    connection: Connection,
    private fetcher: Fetch,
  ) {
    this.connection = Object.freeze({
      ...connection,
      baseUrl: normalizeAddress(connection.baseUrl),
    });
  }
  dispose() {
    this.lifetime.abort();
    this.catalogListeners.clear();
  }
  get signal() {
    return this.lifetime.signal;
  }
  private catalogListeners = new Set<() => void>();
  /**
   * Calls `listener` after a change made through this connection succeeds
   * that can alter the conversation list: sessions, projects, workspaces and
   * sources. Lists that stay on screen (the iPad sidebar) use it to refresh
   * at once instead of waiting for their next poll.
   */
  onCatalogChange(listener: () => void): () => void {
    this.catalogListeners.add(listener);
    return () => this.catalogListeners.delete(listener);
  }
  private catalogChanged(method: string, path: string) {
    if (method === "GET") return;
    // Read-state and title suggestions change nothing in the list; files,
    // channels and settings are not part of it.
    if (!/^\/(sessions|projects|workspaces|catalog|repositories)(\/|$|\?)/.test(path)) return;
    if (/\/(title-suggestion|approvals|interactions|images)\b/.test(path)) return;
    for (const listener of [...this.catalogListeners]) listener();
  }
  private async response<T>(
    path: string,
    init: RequestInit,
    consume: (response: Response) => Promise<T>,
    timeout = 30000,
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid daemon endpoint.");
    const controller = new AbortController();
    const signals = [this.signal, init.signal].filter(
      (s): s is AbortSignal => !!s,
    );
    const abort = () => controller.abort();
    for (const signal of signals) {
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    }
    const timer = timeout ? setTimeout(abort, timeout) : undefined;
    try {
      const headers = new Headers(init.headers);
      if (this.connection.token)
        headers.set("Authorization", `Bearer ${this.connection.token}`);
      const response = await this.fetcher(this.connection.baseUrl + path, {
        ...init,
        headers,
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = record(await response.json());
        throw new ApiError(
          typeof body.message === "string"
            ? body.message
            : `HTTP ${response.status}`,
          response.status,
          String(body.code ?? "http_error"),
        );
      }
      return await consume(response);
    } finally {
      if (timer) clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener("abort", abort);
    }
  }
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
    timeout = 30000,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const result = await this.response(
      path,
      {
        method,
        signal,
        headers: { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      async (response) => {
        if (response.status === 204) return undefined as T;
        const envelope = record(await response.json());
        if (envelope.code !== "ok" || !("data" in envelope))
          throw new Error("Unsupported daemon response envelope.");
        return envelope.data as T;
      },
      timeout,
    );
    this.catalogChanged(method, path);
    return result;
  }
  async uploadAttachment(id: string, file: MessageFileInput): Promise<string> {
    parseMessageFiles([file]);
    const bytes = Uint8Array.from(atob(file.data_base64), (char) =>
      char.charCodeAt(0),
    );
    return this.response(
      `/files/upload?${new URLSearchParams({ sessionId: id, name: file.name })}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes.buffer,
      },
      async (response) => {
        const envelope = record(await response.json());
        const data = record(envelope.data);
        if (
          envelope.code !== "ok" ||
          typeof data.path !== "string" ||
          !data.path
        )
          throw new Error("Invalid uploaded attachment response.");
        return data.path;
      },
      120000,
    );
  }
  async queuedInputs(
    id: string,
    signal?: AbortSignal,
  ): Promise<D.QueuedInput[] | null> {
    try {
      const data = await this.request<{ items: D.QueuedInput[] }>(
        `/sessions/${enc(id)}/queue`,
        "GET",
        undefined,
        signal,
      );
      if (
        !Array.isArray(data.items) ||
        data.items.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            (item.text !== undefined && typeof item.text !== "string") ||
            !["queued", "paused", "sending"].includes(item.state) ||
            !Number.isInteger(item.revision) ||
            typeof item.editable !== "boolean",
        )
      )
        throw new Error("Invalid input queue.");
      return data.items;
    } catch (e) {
      if (e instanceof ApiError && [404, 405].includes(e.status)) return null;
      throw e;
    }
  }
  changeQueuedInput = (
    id: string,
    item: string,
    revision: number,
    text?: string,
    imageIndices?: number[],
  ) =>
    this.request(
      `/sessions/${enc(id)}/queue/${enc(item)}`,
      text === undefined ? "DELETE" : "PATCH",
      { revision, text, image_indices: imageIndices },
    );
  sendQueuedInput = (id: string, item: string, revision: number) =>
    this.request(`/sessions/${enc(id)}/queue/${enc(item)}/send`, "POST", { revision });
  resumeQueue = (id: string) =>
    this.request(`/sessions/${enc(id)}/queue/resume`, "POST");
  search = (id: string, query: string, signal?: AbortSignal) =>
    this.request<D.SessionSearchResponse>(
      `/sessions/${enc(id)}/search?q=${enc(query)}`,
      "GET",
      undefined,
      signal,
      5000,
    );
  itemWindow = (id: string, target: string, signal?: AbortSignal) =>
    this.request<D.SessionItemsResponse>(
      `/sessions/${enc(id)}/items/window?message_id=${enc(target)}`,
      "GET",
      undefined,
      signal,
      5000,
    );
  suggestTitle = (id: string) =>
    this.request<D.TitleSuggestionResponse>(
      `/sessions/${enc(id)}/title-suggestion`,
      "POST",
    );
  async translateSelection(
    id: string,
    text: string,
    language: "zh-CN" | "en",
    signal?: AbortSignal,
    profile?: string,
  ) {
    if (!text.trim() || [...text].length > 8000)
      throw new Error("Select between 1 and 8,000 characters.");
    try {
      const result = record(
        await this.request(
          `/sessions/${enc(id)}/translate`,
          "POST",
          { text, target_language: language, ...(profile ? { profile } : {}) },
          signal,
          35000,
        ),
      );
      if (typeof result.text !== "string")
        throw new Error("Invalid translation response.");
      return {
        text: result.text,
        profile:
          typeof result.profile === "string" ? result.profile : undefined,
        model: typeof result.model === "string" ? result.model : undefined,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        throw new Error(
          "Translation is unavailable. Update this daemon to a version with selection translation support.",
        );
      throw error;
    }
  }
  async image(url: string): Promise<string> {
    const parsed = new URL(url, this.connection.baseUrl);
    if (
      parsed.origin !== this.connection.baseUrl ||
      !/^\/sessions\/[^/]+\/images\/[^/]+$/.test(parsed.pathname) ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    )
      throw new Error("Untrusted image URL.");
    return this.response(parsed.pathname, {}, async (response) => {
      const type = response.headers.get("content-type")?.split(";")[0];
      if (!type || !["image/png", "image/jpeg", "image/webp"].includes(type))
        throw new Error("Unsupported image.");
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error("Image is too large.");
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not decode image."));
        reader.readAsDataURL(blob);
      });
    });
  }

  // Only public, explicitly named endpoints are exposed to screens.
  listCompletionTriggers = async (id: string): Promise<Awaited<ReturnType<ClientApi["listCompletionTriggers"]>>> => {
    try {
      const { items } = await this.request<{ items: NonNullable<Awaited<ReturnType<ClientApi["listCompletionTriggers"]>>> }>(`/sessions/${enc(id)}/completion-triggers?include_history=true`);
      if (!Array.isArray(items) || items.some(item => !item || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.on_fire !== "string" || typeof item.expires_at !== "string" || (item.state !== undefined && !["pending", "fired", "cancelled", "expired"].includes(item.state)))) throw new Error("Invalid completion triggers");
      return items;
    } catch (error) {
      if (error instanceof ApiError && [404, 405].includes(error.status)) return null;
      throw error;
    }
  };
  cancelCompletionTrigger = (id: string, triggerId: string) =>
    this.request(`/sessions/${enc(id)}/completion-triggers/${enc(triggerId)}`, "DELETE");
  repositories = async () => (await this.request<{ repositories: ManagedRepository[] }>("/repositories")).repositories;
  createRepository = (remoteUrl: string) => this.request<ManagedRepository>("/repositories", "POST", { remote_url: remoteUrl }, undefined, 15000);
  linkRepository = (projectId: string, repositoryId: string) =>
    this.request<D.CatalogSource>(`/projects/${enc(projectId)}/sources`, "POST", { repository_id: repositoryId }, undefined, 120000);
  repositoryBranches = async (projectId: string, sourceId: string, refresh = false) => {
    const { branches } = await this.request<{ branches: RepositoryBranch[] }>(`/projects/${enc(projectId)}/sources/${enc(sourceId)}/branches`, refresh ? "POST" : "GET", undefined, undefined, 15000);
    if (!Array.isArray(branches) || branches.some(branch => !branch || typeof branch.name !== "string" || typeof branch.ref !== "string" || !["remote", "imported", "local"].includes(branch.kind))) throw new Error("Invalid repository branches");
    return branches;
  };
  health = () => this.request<D.HealthResponse>("/health");
  agents = () => this.request<D.AgentCatalogResponse>("/agents");
  prepareCodex = () =>
    this.request<D.AgentCatalogEntry>("/agents/codex/prepare", "POST");
  private modelCatalogPromise?: Promise<D.AgentCatalogResponse>;
  modelCatalog = (refresh = false): Promise<D.AgentCatalogResponse> => {
    if (refresh) this.modelCatalogPromise = undefined;
    if (!this.modelCatalogPromise) {
      const request = this.agents().then(async (catalog) => {
        const codex = catalog.agents.find((a) => a.id === "codex");
        if (!codex || (!refresh && codex.models?.length)) return catalog;
        const ready = await this.prepareCodex();
        return {
          ...catalog,
          agents: catalog.agents.map((a) => (a.id === "codex" ? ready : a)),
        };
      });
      this.modelCatalogPromise = request;
      void request.catch(() => {
        if (this.modelCatalogPromise === request)
          this.modelCatalogPromise = undefined;
      });
    }
    return this.modelCatalogPromise;
  };
  profiles = (directory?: string, scope?: "global") =>
    this.request<D.ProfilesResponse>(
      `/config/profiles${scope === "global" ? "?scope=global" : directory ? "?working_directory=" + enc(directory) : ""}`,
    );
  skills = (id?: string) =>
    this.request<D.SkillsResponse>(
      `/skills${id ? "?session_id=" + enc(id) : ""}`,
    );
  projects = async () =>
    (await this.request<{ projects: D.CatalogProject[] }>("/projects"))
      .projects;
  project = (id: string) =>
    this.request<D.CatalogProjectDetail>(`/projects/${enc(id)}`);
  createProject = (name: string) =>
    this.request<D.CatalogProject>("/projects", "POST", { name });
  renameProject = (id: string, name: string) =>
    this.request<D.CatalogProject>(`/projects/${enc(id)}`, "PUT", { name });
  inspectSource = (path: string) =>
    this.request<D.CatalogSourceInspection>("/sources/inspect", "POST", {
      path,
    });
  addSource = (id: string, path: string, folder_mode?: string) =>
    this.request<D.CatalogSource>(`/projects/${enc(id)}/sources`, "POST", {
      path,
      folder_mode,
    });
  removeSource = (id: string, source: string) =>
    this.request(`/projects/${enc(id)}/sources/${enc(source)}`, "DELETE");
  workspaces = async (id: string) =>
    (
      await this.request<{ workspaces: D.CatalogWorkspace[] }>(
        `/projects/${enc(id)}/workspaces`,
      )
    ).workspaces;
  workspace = (id: string) =>
    this.request<D.CatalogWorkspace>(`/workspaces/${enc(id)}`);
  workspaceSources = async (id: string) =>
    (
      await this.request<{ sources: D.CatalogWorkspaceSource[] }>(
        `/workspaces/${enc(id)}/sources`,
      )
    ).sources;
  createWorkspace = (
    id: string,
    title: string,
    sources: D.CatalogWorkspaceSourceInput[],
  ) =>
    this.request<D.CatalogWorkspace>(
      `/projects/${enc(id)}/workspaces`,
      "POST",
      { title, sources },
    );
  addWorkspaceSource = (id: string, source: D.CatalogWorkspaceSourceInput) =>
    this.request<D.CatalogWorkspaceSource>(
      `/workspaces/${enc(id)}/sources`,
      "POST",
      source,
    );
  renameWorkspace = (id: string, title: string) =>
    this.request<D.CatalogWorkspace>(`/workspaces/${enc(id)}`, "PUT", {
      title,
    });
  retryWorkspace = (id: string) =>
    this.request<D.CatalogWorkspace>(`/workspaces/${enc(id)}/retry`, "POST");
  archivePreview = (id: string) =>
    this.request<D.WorkspaceArchivePreview>(
      `/workspaces/${enc(id)}/archive-preview`,
    );
  archiveWorkspace = (id: string) =>
    this.request<D.CatalogWorkspace>(`/workspaces/${enc(id)}/archive`, "POST");
  navigation = () =>
    this.request<{
      pinned: import("@zotigo/shared/clientTypes").NavigationItem[];
      projects: import("@zotigo/shared/clientTypes").NavigationItem[];
      workspaces: import("@zotigo/shared/clientTypes").NavigationItem[];
    }>("/catalog/navigation");
  pinProject = (id: string, pinned: boolean) =>
    this.request("/catalog/navigation/pin", "PUT", {
      item: { kind: "project", id },
      pinned,
    });
  pinWorkspace = (id: string, pinned: boolean) =>
    this.request("/catalog/navigation/pin", "PUT", {
      item: { kind: "workspace", id },
      pinned,
    });
  catalog = async (sync = false) =>
    (
      await this.request<{ sessions: D.CatalogSessionProjection[] }>(
        "/catalog/sessions" + (sync ? "?sync_codex=true" : ""),
      )
    ).sessions.map((entry) => ({
      ...entry,
      runtime: entry.runtime
        ? this.mergeSessionReadState(entry.runtime)
        : entry.runtime,
    }));
  session = async (id: string) =>
    this.mergeSessionReadState(
      await this.request<D.ZotigoSession>(`/sessions/${enc(id)}`),
    );
  getModelSettings = async () => parseModelSettings(await this.request("/config/models"));
  updateModelSettings = async (change: ModelSettingsChange) =>
    parseModelSettings(await this.request("/config/models", "PUT", parseModelSettingsChange(change)));
  testModelSettings = async (change: ModelSettingsChange) => {
    const result = await this.request<ModelTestResult>("/config/models/test", "POST", parseModelSettingsChange(change));
    if (!result || typeof result.ok !== "boolean") throw new Error("Invalid model test response");
    return result;
  };
  createSession = (input: D.CreateSessionInput) =>
    this.request<D.ZotigoSession>("/sessions", "POST", {
      workspace_id: input.workspaceId,
      working_directory: input.workingDirectory,
      agent: input.agent,
      profile: input.profile,
      model: input.model,
      reasoning_effort: input.reasoningEffort,
      approval_policy: input.approvalPolicy,
    });
  items = (id: string, query: D.SessionItemsQuery = {}, signal?: AbortSignal) =>
    this.request<D.SessionItemsResponse>(
      `/sessions/${enc(id)}/items?${new URLSearchParams(Object.entries({ limit: 50, ...query }).map(([k, v]) => [k, String(v)]))}`,
      "GET",
      undefined,
      signal,
      30000,
      { "X-Zotigo-Runtime-Updates": "true" },
    );
  send = (
    id: string,
    input: {
      text: string;
      images?: D.MessageImageInput[];
      skills?: string[];
      client_message_id: string;
    },
    steer: boolean | "queue" = false,
  ) =>
    this.request<D.SessionCommandResponse>(
      `/sessions/${enc(id)}/${steer === "queue" ? "queue" : steer ? "steering" : "messages"}`,
      "POST",
      input,
    );
  pause = (id: string, turn_id: string) =>
    this.request<D.SessionCommandResponse>(
      `/sessions/${enc(id)}/pause`,
      "POST",
      { turn_id },
    );
  start = (id: string) =>
    this.request<D.ZotigoSession>(`/sessions/${enc(id)}/start`, "POST");
  fork = (id: string, request_id: string, through_turn_id?: string) =>
    this.request<D.ZotigoSession>(`/sessions/${enc(id)}/fork`, "POST", {
      request_id,
      through_turn_id,
    });
  renameSession = (id: string, title: string) =>
    this.request<D.CatalogSessionProjection>(
      `/sessions/${enc(id)}/title`,
      "PUT",
      { title },
    );
  pinSession = (id: string, pinned: boolean) =>
    this.request<D.CatalogSessionProjection>(
      `/sessions/${enc(id)}/pinned`,
      "PUT",
      { pinned },
    );
  archiveSession = (id: string) =>
    this.request<D.CatalogSessionProjection>(
      `/sessions/${enc(id)}/archive`,
      "POST",
    );
  approval = (
    id: string,
    approval: string,
    decisions: D.ApprovalDecisionInput[],
  ) =>
    this.request<D.ApprovalDecisionResponse>(
      `/sessions/${enc(id)}/approvals/${enc(approval)}`,
      "POST",
      { decisions },
    );
  interaction = (
    id: string,
    interaction: string,
    answers: Record<string, string[]>,
  ) =>
    this.request<D.InteractionResponse>(
      `/sessions/${enc(id)}/interactions/${enc(interaction)}`,
      "POST",
      { answers },
    );
  changeProfile = (id: string, profile: string) =>
    this.request(`/sessions/${enc(id)}/profile`, "PUT", { profile });
  changeModel = (id: string, model: string, reasoning_effort: string) =>
    this.request<D.ZotigoSession>(
      `/sessions/${enc(id)}/codex-settings`,
      "PUT",
      { model, reasoning_effort },
    );
  changePolicy = (id: string, approval_policy: D.ApprovalPolicy) =>
    this.request(`/sessions/${enc(id)}/approval-policy`, "PUT", {
      approval_policy,
    });
  fileCapabilities = () =>
    this.request<{
      read: boolean;
      write: boolean;
      list: boolean;
      image?: boolean;
    }>("/files/capabilities");
  listDirectory = (path: string, sessionId?: string, sources = false) =>
    this.request<DirectoryListing>(
      sources ? "/sources/directories" : "/files/list",
      "POST",
      { path, sessionId },
    );
  openFile = (
    path: string,
    sessionId?: string,
    explicitOpen = false,
    base?: { basePath: string; baseKind: "directory" | "file" },
  ) =>
    this.request<OpenFile>("/files/open", "POST", {
      path,
      sessionId,
      explicitOpen,
      ...base,
    });
  previewImage = (
    path: string,
    sessionId: string,
    explicitOpen = false,
    base?: { basePath: string; baseKind: "directory" | "file" },
  ) => this.request<OpenFile>("/files/open", "POST", {
    path, sessionId, explicitOpen, imageOnly: true, ...base,
  });
  saveFile = (input: SaveTextFileInput) =>
    this.request<TextFileSnapshot>("/files/save", "POST", input);
  updateConnection = (
    id: string,
    input: import("@zotigo/shared/channels").ChannelConnectionInput,
  ) =>
    this.request<ChannelConnection>(
      `/channels/connections/${enc(id)}`,
      "PUT",
      input,
    );
  updateChannelConversation = (
    id: string,
    input: import("@zotigo/shared/channels").ChannelConversationInput,
  ) =>
    this.request<ChannelConversation>(
      `/channels/conversations/${enc(id)}`,
      "PUT",
      input,
    );
  connections = async () =>
    (
      await this.request<{ connections: ChannelConnection[] }>(
        "/channels/connections",
      )
    ).connections;
  channelConversations = async () =>
    (
      await this.request<{ conversations: ChannelConversation[] }>(
        "/channels/conversations",
      )
    ).conversations;
  channelMessages = async (id: string) =>
    (
      await this.request<{ messages: ChannelMessage[] }>(
        `/channels/conversations/${enc(id)}/messages`,
      )
    ).messages;
  async stream(
    id: string,
    after: number,
    signal: AbortSignal,
  ): Promise<Response> {
    return this.fetcher(
      this.connection.baseUrl + `/sessions/${enc(id)}/events?after=${after}`,
      {
        headers: {
          Accept: "text/event-stream",
          "X-Zotigo-Runtime-Updates": "true",
          ...(this.connection.token
            ? { Authorization: `Bearer ${this.connection.token}` }
            : {}),
        },
        redirect: "error",
        signal,
      },
    );
  }
}
