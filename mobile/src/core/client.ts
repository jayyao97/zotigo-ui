import type * as D from "@zotigo/shared/zotigod";
import type {
  DirectoryListing,
  TextFileSnapshot,
  ImageFileSnapshot,
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
export function normalizeAddress(input: string): string {
  const url = new URL(input.trim());
  if (
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
  }
  get signal() {
    return this.lifetime.signal;
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
  ): Promise<T> {
    return this.response(
      path,
      {
        method,
        signal,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      async (response) => {
        if (response.status === 204) return undefined as T;
        const envelope = record(await response.json());
        if (envelope.code !== "ok" || !("data" in envelope))
          throw new Error("Unsupported daemon response envelope.");
        return envelope.data as T;
      },
    );
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
  health = () => this.request<D.HealthResponse>("/health");
  agents = () => this.request<D.AgentCatalogResponse>("/agents");
  prepareCodex = () =>
    this.request<D.AgentCatalogEntry>("/agents/codex/prepare", "POST");
  profiles = (directory?: string) =>
    this.request<D.ProfilesResponse>(
      `/config/profiles${directory ? "?working_directory=" + enc(directory) : ""}`,
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
  catalog = async (sync = false) =>
    (
      await this.request<{ sessions: D.CatalogSessionProjection[] }>(
        "/catalog/sessions" + (sync ? "?sync_codex=true" : ""),
      )
    ).sessions;
  session = (id: string) =>
    this.request<D.ZotigoSession>(`/sessions/${enc(id)}`);
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
    );
  send = (
    id: string,
    input: {
      text: string;
      images?: D.MessageImageInput[];
      skills?: string[];
      client_message_id: string;
    },
    steer = false,
  ) =>
    this.request<D.SessionCommandResponse>(
      `/sessions/${enc(id)}/${steer ? "steering" : "messages"}`,
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
  saveFile = (input: SaveTextFileInput) =>
    this.request<TextFileSnapshot>("/files/save", "POST", input);
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
