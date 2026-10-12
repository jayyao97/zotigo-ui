import { pickedImageInput } from "../../src/core/imageInput";
import { attachmentPng } from "./attachment";
import type {
  DisplayItem,
  CatalogProjectDetail,
  CatalogWorkspace,
  ZotigoSession,
  CatalogSessionProjection,
  SessionDisplayEvent,
  QueuedInput,
} from "@zotigo/shared/zotigod";
import type { Fetch } from "../../src/core/client";

const now = "2026-10-11T09:30:00Z";
const png = attachmentPng;
type Fault =
  | "none"
  | "offline"
  | "unauthorized"
  | "catalog"
  | "save-conflict"
  | "send-rejected";
type HostState = {
  fault: Fault;
  pins: { kind: string; id: string }[];
  projects: CatalogProjectDetail[];
  workspaces: CatalogWorkspace[];
  sessions: Map<
    string,
    {
      runtime: ZotigoSession;
      title: string;
      workspaceId: string;
      items: DisplayItem[];
      pinned: boolean;
      archived: boolean;
      queue?: QueuedInput[];
    }
  >;
  file: { content: string; revision: number };
  streams: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>;
  bindings: Map<string, string[]>;
  sends: Set<string>;
  historyRequests: number;
  translationRequests: number;
  lastTranslationText?: string;
  lastSubmission?: {
    sessionId: string;
    body: Record<string, unknown>;
    accepted: boolean;
  };
};
function display(
  sequence: number,
  type: DisplayItem["type"],
  extra: Partial<DisplayItem> = {},
): DisplayItem {
  return {
    id: `display-${sequence}`,
    sequence,
    type,
    created_at: now,
    ...extra,
  };
}
function history(work: boolean): DisplayItem[] {
  const prefix = work ? "Work" : "Home";
  const old = Array.from({ length: 30 }, (_, i) =>
    display(i + 1, i % 2 ? "assistant_message" : "user_message", {
      content: [
        {
          type: "text",
          text:
            i % 2
              ? `Verified step ${Math.ceil(i / 2)}. The workspace tests pass and the daemon connection stays scoped to this device.`
              : `Check the ${prefix.toLowerCase()} workspace, step ${Math.ceil((i + 1) / 2)}.`,
        },
      ],
    }),
  );
  return [
    ...old,
    display(31, "turn_completed", {
      turn: { id: "old-turn", duration_ms: 42300 },
    }),
    display(32, "turn_started", { turn: { id: "active-turn" } }),
    display(33, "user_message", {
      content: [
        {
          type: "text",
          text: `${prefix}: review the **multi-host mobile architecture** and improve reconnect reliability. Show the relevant changes before applying them.`,
        },
        {
          type: "image",
          image: { url: "/tmp/codex-input.png", mime_type: "image/png" },
        },
      ],
    }),
    display(34, "assistant_message", {
      content: [
        {
          type: "text",
          text: "I’ll check the host boundary, then review stream recovery and draft persistence.\n\n### Implementation plan\n\n- Keep credentials scoped to an immutable connection.\n- Resume event streams from the last durable sequence.\n- Preserve unsent drafts when switching devices.\n\nThe relevant code is [client.ts](src/client.ts).\n\n![Architecture preview](/sessions/session-shared/images/preview)\n\n```ts\nconst client = new DaemonClient(connection, fetch);\nawait client.health();\n```\n\n```mermaid\nflowchart LR\n Phone[Mobile app] --> VPN[Tailscale / VPN]\n VPN --> Home[Home daemon]\n VPN --> Work[Work daemon]\n```\n\n| Area | Result |\n| --- | --- |\n| Host isolation | Passed |\n| Stream reconnect | Needs one fix |",
        },
        {
          type: "reasoning",
          text: "The native screen should own its connection lifetime. Volatile deltas cannot be used as a durable replay cursor; requests and credentials must remain tied to the chosen daemon.",
        },
      ],
    }),
    display(35, "assistant_message", {
      content: [
        {
          type: "tool_call",
          tool_call: {
            id: "tool-read",
            name: "exec_command",
            arguments: JSON.stringify(
              {
                cmd: "pnpm test && git diff --stat",
                workdir: "/workspace/zotigo-mobile",
              },
              null,
              2,
            ),
          },
        },
      ],
    }),
    display(36, "assistant_message", {
      content: [
        {
          type: "tool_result",
          tool_result: {
            tool_call_id: "tool-read",
            tool_name: "exec_command",
            text: "Tests: 28 passed, 28 total\nTime: 1.92 s\n\n mobile/src/core/client.ts   | 14 +++++++++-----\n mobile/src/core/timeline.ts | 22 +++++++++++++++++-----\n\nAll host isolation and reconnect regression checks passed.",
            exit_code: 0,
          },
        },
        {
          type: "image",
          image: {
            url: "/sessions/session-shared/images/preview",
            mime_type: "image/png",
          },
        },
      ],
    }),
    display(37, "assistant_message", {
      subagent: {
        tool_call_id: "review-1",
        name: "Architecture review",
        status: "completed",
        description: "Inspect daemon boundaries",
      },
      content: [
        {
          type: "text",
          text: "Review complete: no cross-host state sharing was found. The pending-reader cleanup needs the small change shown above.",
        },
      ],
    }),
    display(38, "approval_request", {
      turn: { id: "active-turn" },
      approval: {
        id: "approval-preview",
        turn_id: "active-turn",
        pending: [
          {
            tool_call_id: "write-1",
            tool_name: "apply_patch",
            description: "Update event-stream cancellation",
            arguments:
              '{"path":"src/client.ts","change":"Cancel the reader when leaving the conversation"}',
            reason: "Apply the reviewed change to your workspace.",
            risk_level: "low",
          },
        ],
      },
    }),
    display(39, "interaction_request", {
      turn: { id: "active-turn" },
      interaction: {
        id: "question-preview",
        kind: "user_input",
        turn_id: "active-turn",
        status: "pending",
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which change should be reviewed?",
            is_other: true,
            options: [
              {
                label: "Reconnect",
                description: "Review the stream cancellation change.",
              },
              { label: "Drafts", description: "Review draft persistence." },
            ],
          },
          {
            id: "checks",
            header: "Validation",
            question: "Which check should run?",
            is_other: false,
            options: [{ label: "Unit tests" }, { label: "Typecheck" }],
          },
        ],
      },
    }),
  ];
}
function makeHost(work: boolean): HostState {
  const label = work ? "Work" : "Home";
  const root = work ? "/work/zotigo-mobile" : "/workspace/zotigo-mobile";
  const projects: CatalogProjectDetail[] = [
    {
      id: "project-mobile",
      name: "Zotigo Mobile",
      created_at: now,
      updated_at: now,
      sources: [
        {
          id: "source-ui",
          project_id: "project-mobile",
          kind: "git",
          canonical_path: root,
          source_key: "ui",
          created_at: now,
          updated_at: now,
        },
      ],
    },
    {
      id: "project-daemon",
      name: work ? "Company tools" : "Personal automation",
      created_at: now,
      updated_at: now,
      sources: [],
    },
  ];
  const workspaces: CatalogWorkspace[] = [
    {
      id: "workspace-main",
      project_id: "project-mobile",
      title: "iOS client · feature/mobile",
      root_path: root,
      status: "ready",
      created_at: now,
      updated_at: now,
    },
    {
      id: "workspace-review",
      project_id: "project-mobile",
      title: "Stream recovery review",
      root_path: root + "-review",
      status: "ready",
      created_at: now,
      updated_at: now,
    },
    {
      id: "workspace-error",
      project_id: "project-mobile",
      title: "Experimental checkout",
      root_path: root + "-experiment",
      status: "error",
      error: "Source branch is unavailable. Choose a valid base ref and retry.",
      created_at: now,
      updated_at: now,
    },
  ];
  const sessions: HostState["sessions"] = new Map();
  for (let i = 0; i < 14; i++) {
    const id = i ? `session-${i}` : "session-shared";
    sessions.set(id, {
      runtime: {
        id,
        state: i ? "paused" : "running",
        live: true,
        working: !i,
        working_directory: root,
        agent: "codex",
        model: "gpt-5.3-codex",
        reasoning_effort: "high",
        approval_policy: "auto",
        created_at: now,
        context_usage: { tokens: 18340, window: 200000 },
      },
      workspaceId: "workspace-main",
      title: i
        ? [
            `${label}: Fix keyboard safe-area handling`,
            "Review daemon API contracts",
            "Implement persistent drafts",
            "Optimize long conversation scrolling",
          ][i % 4] + (i > 3 ? ` · ${i}` : "")
        : `${label}: Multi-host mobile architecture`,
      items: i
        ? [
            display(0, "turn_started", { turn: { id: "complete" } }),
            display(1, "user_message", {
              turn: { id: "complete" },
              content: [
                {
                  type: "text",
                  text: "Please investigate the issue and propose a small, tested change.",
                },
              ],
            }),
            display(2, "assistant_message", {
              content: [
                {
                  type: "tool_call",
                  tool_call: {
                    id: "read-source",
                    name: "read_file",
                    arguments: '{"path":"src/client.ts"}',
                  },
                },
              ],
            }),
            display(3, "assistant_message", {
              content: [
                {
                  type: "tool_result",
                  tool_result: {
                    tool_call_id: "read-source",
                    tool_name: "read_file",
                    text: "Connection lifetime is scoped to the selected device.",
                  },
                },
              ],
            }),
            display(4, "assistant_message", {
              content: [
                {
                  type: "tool_call",
                  tool_call: {
                    id: "check-tests",
                    name: "exec_command",
                    arguments: '{"cmd":"pnpm test"}',
                  },
                },
              ],
            }),
            display(5, "assistant_message", {
              content: [
                {
                  type: "tool_result",
                  tool_result: {
                    tool_call_id: "check-tests",
                    tool_name: "exec_command",
                    text: "52 tests passed.",
                  },
                },
              ],
            }),
            display(6, "assistant_message", {
              content: [
                {
                  type: "text",
                  text: "The investigation is complete. The next step is to validate the behavior on a real iPhone.",
                },
              ],
            }),
            display(7, "turn_completed", { turn: { id: "complete" } }),
          ]
        : history(work),
      pinned: i === 0,
      archived: false,
    });
  }
  return {
    fault: "none",
    pins: [],
    projects,
    workspaces,
    sessions,
    file: {
      content:
        '// Zotigo mobile connection\nexport function connect(host: string) {\n  return fetch(host + "/health");\n}\n',
      revision: 1,
    },
    streams: new Map(),
    bindings: new Map(workspaces.map((w) => [w.id, ["source-ui"]])),
    sends: new Set(),
    historyRequests: 0,
    translationRequests: 0,
  };
}
const hosts = { home: makeHost(false), work: makeHost(true) };
const envelope = (data: unknown) => Response.json({ code: "ok", data });
const failure = (message: string, status = 400, code = "fixture_error") =>
  Response.json({ code, message }, { status });
function publish(host: HostState, id: string, event: SessionDisplayEvent) {
  if (event.type === "item") host.sessions.get(id)?.items.push(event.item);
  const bytes = new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event.type === "item" ? event.item : event.delta)}\n\n`,
  );
  for (const controller of host.streams.get(id) ?? [])
    controller.enqueue(bytes);
}
function projection(host: HostState, id: string): CatalogSessionProjection {
  const session = host.sessions.get(id)!;
  const workspace = host.workspaces.find((w) => w.id === session.workspaceId)!;
  return {
    runtime: session.runtime,
    availability: "available",
    organization: {
      session_id: id,
      project_id: workspace.project_id,
      workspace_id: workspace.id,
      title: session.title,
      pinned_at: session.pinned ? now : null,
      pinned_position: session.pinned ? 0 : null,
      workspace_position: null,
      self_archived_at: session.archived ? now : null,
      workspace_archived_at: workspace.status === "archived" ? now : null,
      revision: 1,
      created_at: now,
      updated_at: now,
    },
  };
}
const agents = {
  default_agent: "codex",
  agents: [
    {
      id: "codex",
      label: "Codex",
      availability: "available",
      version: "preview-fixture",
      capabilities: {
        profiles: false,
        models: true,
        steering: true,
        approvals: true,
      },
      models: [
        {
          id: "gpt-5.3-codex",
          display_name: "GPT-5.3 Codex",
          is_default: true,
          supported_reasoning_efforts: ["medium", "high", "xhigh"],
        },
      ],
    },
    {
      id: "zotigo",
      label: "Zotigo",
      availability: "available",
      capabilities: {
        profiles: true,
        models: false,
        steering: true,
        approvals: true,
      },
    },
  ],
};

export const fixtureFetch: Fetch = async (input, init = {}) => {
  if (init.signal?.aborted) throw new Error("Fixture request aborted.");
  const url = new URL(input);
  const key =
    url.hostname === "home.fixture.test"
      ? "home"
      : url.hostname === "work.fixture.test"
        ? "work"
        : undefined;
  if (!key)
    throw new Error(
      "The preview only accepts fixture daemon origins; no real network request was made.",
    );
  const host = hosts[key],
    path = decodeURIComponent(url.pathname),
    method = init.method ?? "GET";
  const body =
    typeof init.body === "string" && init.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
  if (host.fault === "offline")
    throw new Error(
      "Fixture: device is offline. Reconnect your VPN and try again.",
    );
  if (
    host.fault === "unauthorized" ||
    new Headers(init.headers).get("Authorization") !== "Bearer fixture-token"
  )
    return failure("Fixture: daemon token is invalid.", 401, "unauthorized");
  if (path === "/health")
    return envelope({ status: "ok", protocol_version: "1" });
  if (path === "/agents") return envelope(agents);
  if (path === "/agents/codex/prepare") return envelope(agents.agents[0]);
  if (path === "/config/profiles")
    return envelope({
      default_profile: "balanced",
      profiles: [
        { name: "balanced", provider: "openai", model: "gpt-5.3-codex" },
        {
          name: "review",
          provider: "openai",
          model: "gpt-5.3-codex",
          thinking_level: "high",
        },
      ],
    });
  if (path === "/skills")
    return envelope({
      skills: [
        {
          name: "engineering-principles",
          description: "Small, testable changes with clear module ownership.",
          scope: "user",
          enabled: true,
        },
        {
          name: "review-taste",
          description: "Review invariants, maintainability and correctness.",
          scope: "workspace",
          enabled: true,
        },
      ],
      diagnostics: [],
    });
  if (path === "/catalog/navigation")
    return envelope({
      pinned: host.pins,
      projects: host.projects
        .map((p) => ({ kind: "project", id: p.id }))
        .reverse(),
      workspaces: host.workspaces
        .map((w) => ({ kind: "workspace", id: w.id }))
        .reverse(),
    });
  if (path === "/catalog/navigation/pin" && method === "PUT") {
    const item = body.item as { kind: string; id: string };
    host.pins = host.pins.filter(
      (p) => p.kind !== item.kind || p.id !== item.id,
    );
    if (body.pinned) host.pins.push(item);
    return envelope({});
  }
  if (path === "/catalog/sessions") {
    if (host.fault === "catalog")
      return failure(
        "Fixture: catalog is temporarily unavailable. Pull to retry.",
        503,
      );
    return envelope({
      sessions: [...host.sessions.keys()].map((id) => projection(host, id)),
    });
  }
  if (path === "/projects" && method === "POST") {
    const project = {
      id: "project-" + (host.projects.length + 1),
      name: String(body.name),
      sources: [],
      created_at: now,
      updated_at: now,
    };
    host.projects.push(project);
    return envelope(project);
  }
  if (path === "/projects") return envelope({ projects: host.projects });
  const projectMatch = path.match(
    /^\/projects\/([^/]+)(?:\/(workspaces|sources))?(?:\/([^/]+))?$/,
  );
  if (projectMatch) {
    const project = host.projects.find((p) => p.id === projectMatch[1]);
    if (!project) return failure("Project missing.", 404);
    if (projectMatch[2] === "workspaces") {
      if (method === "POST") {
        const workspace: CatalogWorkspace = {
          id: "workspace-" + host.workspaces.length,
          project_id: project.id,
          title: String(body.title),
          root_path: "/workspace/" + String(body.title),
          status: "ready",
          created_at: now,
          updated_at: now,
        };
        host.workspaces.push(workspace);
        host.bindings.set(
          workspace.id,
          ((body.sources ?? []) as Array<{ source_id: string }>).map(
            (s) => s.source_id,
          ),
        );
        return envelope(workspace);
      }
      return envelope({
        workspaces: host.workspaces.filter((w) => w.project_id === project.id),
      });
    }
    if (projectMatch[2] === "sources") {
      if (method === "DELETE") {
        project.sources = project.sources.filter(
          (s) => s.id !== projectMatch[3],
        );
        return new Response(null, { status: 204 });
      }
      const source = {
        id: "source-" + project.sources.length,
        project_id: project.id,
        kind: "git" as const,
        canonical_path: String(body.path),
        source_key: String(body.path),
        created_at: now,
        updated_at: now,
      };
      project.sources.push(source);
      return envelope(source);
    }
    if (method === "PUT") project.name = String(body.name);
    return envelope(project);
  }
  const workspaceMatch = path.match(
    /^\/workspaces\/([^/]+)(?:\/(sources|retry|archive-preview|archive))?$/,
  );
  if (workspaceMatch) {
    const workspace = host.workspaces.find((w) => w.id === workspaceMatch[1]);
    if (!workspace) return failure("Workspace missing.", 404);
    if (workspaceMatch[2] === "sources") {
      const project = host.projects.find((p) => p.id === workspace.project_id)!;
      const ids = host.bindings.get(workspace.id) ?? [];
      const binding = (source: CatalogProjectDetail["sources"][number]) => ({
        source,
        target_path: workspace.root_path,
        status: "ready",
        branch_name: "feature/mobile",
        base_ref: "main",
      });
      if (method === "POST") {
        const source = project.sources.find((s) => s.id === body.source_id);
        if (!source) return failure("Source missing from project.", 404);
        if (ids.includes(source.id))
          return failure("Source already bound.", 409);
        host.bindings.set(workspace.id, [...ids, source.id]);
        return envelope(binding(source));
      }
      return envelope({
        sources: project.sources.filter((s) => ids.includes(s.id)).map(binding),
      });
    }
    if (workspaceMatch[2] === "archive-preview")
      return envelope({
        workspace_id: workspace.id,
        workspace_title: workspace.title,
        root_path: workspace.root_path,
        worktree_paths: [workspace.root_path],
        dirty_worktree_paths: [],
      });
    if (workspaceMatch[2] === "archive") workspace.status = "archived";
    if (workspaceMatch[2] === "retry") {
      workspace.status = "ready";
      workspace.error = undefined;
    }
    if (method === "PUT") workspace.title = String(body.title);
    return envelope(workspace);
  }
  if (path === "/sources/inspect")
    return envelope({
      kind: "git",
      canonical_path: String(body.path),
      source_key: String(body.path),
    });
  if (path === "/files/capabilities")
    return envelope({ read: true, write: true, list: true, image: true });
  if (path === "/files/list" || path === "/sources/directories") {
    const root = host.workspaces[0].root_path,
      directory = String(body.path || root);
    return envelope({
      path: directory,
      parentPath: directory === root ? null : root,
      entries:
        path === "/sources/directories"
          ? [{ name: "zotigo-ui", path: root, kind: "directory" }]
          : directory.endsWith("/src")
            ? [
                {
                  name: "client.ts",
                  path: root + "/src/client.ts",
                  kind: "file",
                },
              ]
            : [
                { name: "src", path: root + "/src", kind: "directory" },
                {
                  name: "README.md",
                  path: root + "/README.md",
                  kind: "file",
                },
                {
                  name: "preview.png",
                  path: root + "/preview.png",
                  kind: "file",
                },
              ],
      truncated: false,
    });
  }
  if (path === "/files/upload" && method === "POST") {
    if (!host.sessions.has(url.searchParams.get("sessionId") ?? ""))
      return failure("Session missing", 404);
    return envelope({
      path: `/workspace/.attachments/${url.searchParams.get("name")}`,
    });
  }
  if (path === "/files/open") {
    const target = String(body.path).startsWith("/")
      ? String(body.path)
      : String(body.basePath) + "/" + String(body.path);
    if (target.endsWith(".png"))
      return envelope({
        kind: "image",
        file: {
          path: target,
          name: "preview.png",
          mediaType: "image/png",
          dataBase64: png,
          sizeBytes: 68,
          mtimeMs: 1,
        },
      });
    return envelope({
      kind: "text",
      file: {
        path: target,
        name: target.split("/").at(-1),
        content: host.file.content,
        contentRevision: String(host.file.revision),
        mtimeMs: host.file.revision,
        readOnly: false,
        sizeBytes: host.file.content.length,
      },
    });
  }
  if (path === "/files/save") {
    if (
      host.fault === "save-conflict" ||
      body.expectedContentRevision !== String(host.file.revision)
    )
      return failure(
        "Fixture: file changed externally; your draft is preserved.",
        409,
        "conflict",
      );
    host.file.content = String(body.content);
    host.file.revision++;
    return envelope({
      path: body.path,
      name: String(body.path).split("/").at(-1),
      content: host.file.content,
      contentRevision: String(host.file.revision),
      mtimeMs: host.file.revision,
      readOnly: false,
      sizeBytes: host.file.content.length,
    });
  }
  if (path === "/channels/connections")
    return envelope({
      connections: [
        {
          id: "channel-1",
          name: "Development bot",
          provider: "feishu",
          enabled: true,
          status: "connected",
          bot_name: "Zotigo",
          has_secret: true,
        },
      ],
    });
  if (path === "/channels/conversations")
    return envelope({
      conversations: [
        {
          id: "channel-room",
          connection_id: "channel-1",
          chat_id: "engineering",
          display_name: "Mobile client review",
          chat_name: "Engineering",
          chat_type: "group",
          enabled: true,
          agent: "codex",
          session_strategy: "topic",
          session_id: "session-shared",
        },
      ],
    });
  if (path === "/channels/conversations/channel-room/messages")
    return envelope({
      messages: [
        {
          id: "m1",
          sender: { id: "fixture-user", display_name: "Preview user" },
          text: "Please review the reconnect implementation and summarize the changes.",
          created_at: now,
          trigger_status: "accepted",
        },
        {
          id: "m2",
          sender: { id: "fixture-user", display_name: "Preview user" },
          text: "The same conversation is available on my phone.",
          created_at: now,
          trigger_status: "accepted",
        },
      ],
    });
  if (path === "/sessions" && method === "POST") {
    const id = "created-" + host.sessions.size,
      workspace = host.workspaces.find((w) => w.id === body.workspace_id)!;
    const runtime: ZotigoSession = {
      id,
      state: "created",
      live: false,
      working: false,
      agent: body.agent as "codex" | "zotigo",
      model: String(body.model ?? ""),
      profile: String(body.profile ?? ""),
      reasoning_effort: String(body.reasoning_effort ?? ""),
      working_directory: workspace.root_path,
      created_at: now,
    };
    host.sessions.set(id, {
      runtime,
      workspaceId: workspace.id,
      title: "New session",
      items: [],
      pinned: false,
      archived: false,
    });
    return envelope(runtime);
  }
  const sessionMatch = path.match(/^\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (sessionMatch) {
    const id = sessionMatch[1],
      action = sessionMatch[2] ?? "",
      session = host.sessions.get(id);
    if (!session) return failure("Session missing.", 404);
    if (!action) return envelope(session.runtime);
    if (action === "title-suggestion")
      return envelope({ title: "Review mobile host isolation" });
    if (action === "search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      return envelope({
        hits: session.items
          .filter((item) =>
            item.content?.some((part) => part.text?.toLowerCase().includes(q)),
          )
          .map(({ id, sequence }) => ({ id, sequence })),
        truncated: false,
      });
    }
    if (action === "items/window") {
      const index = session.items.findIndex(
        (item) => item.id === url.searchParams.get("message_id"),
      );
      if (index < 0) return failure("Message missing", 404);
      return envelope({
        items: session.items.slice(Math.max(0, index - 10), index + 11),
        has_more: index > 10,
        prev_cursor: "",
        next_cursor: "",
      });
    }
    if (action === "queue" && method === "GET")
      return envelope({ items: session.queue ?? [] });
    if (action === "queue/resume") {
      for (const item of session.queue ?? []) {
        item.state = "queued";
        item.revision++;
      }
      return envelope({});
    }
    if (action.startsWith("queue/") && ["PATCH", "DELETE"].includes(method)) {
      const item = session.queue?.find((item) => item.id === action.slice(6));
      if (!item) return failure("Queued message missing", 404);
      if (item.revision !== body.revision)
        return failure(
          "Queue changed. Reopen the message to edit the latest version.",
          409,
          "conflict",
        );
      if (method === "DELETE")
        session.queue = session.queue?.filter((value) => value !== item);
      else {
        item.text = String(body.text);
        item.revision++;
      }
      return envelope({});
    }
    if (action === "queue" && method === "POST") {
      const request = String(body.client_message_id);
      if (!host.sends.has(request)) {
        host.sends.add(request);
        (session.queue ??= []).push({
          id: request,
          sequence: session.items.length + 1,
          type: "message",
          text: String(body.text),
          created_at: now,
          state: "queued",
          revision: 1,
          editable: true,
        });
      }
      return envelope({ status: "accepted", id: request });
    }
    if (action === "translate" && method === "POST") {
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        [...body.text].length > 8000 ||
        !["zh-CN", "en"].includes(String(body.target_language))
      )
        return failure("Invalid selection translation.", 400);
      host.translationRequests++;
      host.lastTranslationText = body.text;
      return envelope({
        text:
          body.target_language === "zh-CN"
            ? "预览翻译：连接始终限定在所选设备。"
            : "Preview translation: the connection stays scoped to the selected device.",
        profile: "fixture-translation",
        model: "fixture-model",
      });
    }
    if (action === "fork" && method === "POST") {
      const forkId = "fork-" + String(body.request_id);
      if (!host.sessions.has(forkId))
        host.sessions.set(forkId, {
          ...session,
          runtime: {
            ...session.runtime,
            id: forkId,
            working: false,
            forked_from: {
              session_id: id,
              through_turn_id: String(body.through_turn_id),
            },
          },
          title: "Fork · " + session.title,
          items: [...session.items],
          pinned: false,
        });
      return envelope(host.sessions.get(forkId)!.runtime);
    }
    if (action === "items") {
      host.historyRequests++;
      const before = Number(url.searchParams.get("before") ?? Infinity),
        limit = Math.min(
          Number(url.searchParams.get("limit") ?? 50),
          before === Infinity ? 20 : Infinity,
        );
      const selected = session.items.filter((i) => i.sequence < before);
      const slice = selected.slice(-limit);
      return envelope({
        items: slice,
        prev_cursor:
          selected.length > slice.length ? String(slice[0].sequence) : "",
        next_cursor: "",
        has_more: selected.length > slice.length,
      });
    }
    if (action === "events") {
      const subscribers = host.streams.get(id) ?? new Set();
      host.streams.set(id, subscribers);
      let controller: ReadableStreamDefaultController<Uint8Array>;
      const close = () => {
        if (subscribers.delete(controller)) controller.close();
      };
      const stream = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
          subscribers.add(value);
          for (const item of session.items.filter(
            (i) => i.sequence > Number(url.searchParams.get("after") ?? 0),
          ))
            value.enqueue(
              new TextEncoder().encode(
                `event: item\ndata: ${JSON.stringify(item)}\n\n`,
              ),
            );
          init.signal?.addEventListener("abort", close, { once: true });
        },
        cancel() {
          subscribers.delete(controller);
          init.signal?.removeEventListener("abort", close);
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    if (action.startsWith("images/"))
      return new Response(
        Uint8Array.from(atob(png), (c) => c.charCodeAt(0)),
        { headers: { "Content-Type": "image/png" } },
      );
    if (action === "title") session.title = String(body.title);
    if (action === "pinned") session.pinned = Boolean(body.pinned);
    if (action === "archive") session.archived = true;
    if (action === "start") {
      session.runtime.live = true;
      session.runtime.state = "running";
    }
    if (action === "codex-settings") {
      session.runtime.model = String(body.model);
      session.runtime.reasoning_effort = String(body.reasoning_effort);
    }
    if (action === "profile") session.runtime.profile = String(body.profile);
    if (action === "approval-policy")
      session.runtime.approval_policy = body.approval_policy as
        | "auto"
        | "bypass_permissions";
    if (action.startsWith("approvals/"))
      publish(host, id, {
        type: "item",
        item: display(session.items.length + 1, "approval_decision", {
          approval: {
            id: "approval-preview",
            decisions: body.decisions as [],
          },
        }),
      });
    if (action.startsWith("interactions/")) {
      const response = {
        id: "question-preview",
        kind: "user_input" as const,
        turn_id: "active-turn",
        status: "resolved" as const,
        answers: body.answers as Record<string, string[]>,
      };
      publish(host, id, {
        type: "item",
        item: display(session.items.length + 1, "interaction_response", {
          interaction: response,
        }),
      });
      return envelope(response);
    }
    if (action === "pause")
      publish(host, id, {
        type: "item",
        item: display(session.items.length + 1, "turn_interrupted", {
          turn: { id: "active-turn", reason: "Paused from mobile preview" },
        }),
      });
    if (action === "messages" || action === "steering") {
      host.lastSubmission = { sessionId: id, body, accepted: false };
      if (host.fault === "send-rejected")
        return failure(
          "Fixture: message rejected. Edit the draft and try again.",
          400,
          "invalid_message",
        );
      try {
        if (body.images !== undefined && !Array.isArray(body.images))
          throw new Error("Images must be an array.");
        for (const image of (body.images ?? []) as Array<{
          data_base64: string;
          mime_type: string;
        }>) {
          if (
            pickedImageInput({ base64: image.data_base64 }).mime_type !==
            image.mime_type
          )
            throw new Error("Declared image MIME does not match actual bytes.");
        }
      } catch (error) {
        return failure(
          error instanceof Error ? error.message : "Invalid image.",
          400,
          "invalid_image",
        );
      }
      host.lastSubmission.accepted = true;
      const request = String(body.client_message_id);
      if (!host.sends.has(request)) {
        host.sends.add(request);
        publish(host, id, {
          type: "item",
          item: display(session.items.length + 1, "user_message", {
            content: [{ type: "text", text: String(body.text) }],
          }),
        });
        const block = "reply-" + request;
        setTimeout(
          () =>
            publish(host, id, {
              type: "delta",
              delta: {
                item_id: block,
                role: "assistant",
                part_type: "text",
                delta:
                  "I’m checking the implementation and keeping the changes scoped to this device…",
              },
            }),
          150,
        );
        setTimeout(() => {
          publish(host, id, {
            type: "item",
            item: {
              ...display(session.items.length + 1, "assistant_message", {
                content: [
                  {
                    type: "text",
                    text: "The change is ready. **Host isolation remains intact**, and the stream resumes from the last durable item.\n\n```diff\n+ await reader.cancel();\n```\n\nNext: validate keyboard and back gestures on your iPhone.",
                  },
                ],
              }),
              id: block,
            },
          });
          publish(host, id, {
            type: "item",
            item: display(session.items.length + 1, "turn_completed", {
              turn: { id: "active-turn", duration_ms: 920 },
            }),
          });
        }, 1000);
      }
      return envelope({ status: "accepted", id: request });
    }
    if (
      [
        "title",
        "pinned",
        "archive",
        "start",
        "codex-settings",
        "profile",
        "approval-policy",
        "pause",
      ].includes(action) ||
      action.startsWith("approvals/")
    )
      return envelope(session.runtime);
    return failure("Unimplemented fixture session action: " + action, 404);
  }
  return failure("Unimplemented fixture endpoint: " + method + " " + path, 404);
};
export const preview = {
  hosts: ["home", "work"],
  appendMarkdown(host: "home" | "work", text: string) {
    publish(hosts[host], "session-shared", {
      type: "delta",
      delta: {
        item_id: "stream-render-regression",
        role: "assistant",
        part_type: "text",
        delta: text,
      },
    });
  },
  fault(host: "home" | "work", fault: Fault) {
    hosts[host].fault = fault;
  },
  disconnect(host: "home" | "work") {
    for (const set of hosts[host].streams.values()) {
      for (const controller of set) controller.close();
      set.clear();
    }
  },
  reset() {
    this.disconnect("home");
    this.disconnect("work");
    hosts.home = makeHost(false);
    hosts.work = makeHost(true);
  },
  snapshot(host: "home" | "work") {
    return {
      fault: hosts[host].fault,
      historyRequests: hosts[host].historyRequests,
      translationRequests: hosts[host].translationRequests,
      lastTranslationText: hosts[host].lastTranslationText,
      lastSubmission: hosts[host].lastSubmission,
      sessions: [...hosts[host].sessions.values()].map((s) => ({
        id: s.runtime.id,
        title: s.title,
        items: s.items.length,
      })),
      activeStreams: [...hosts[host].streams.values()].reduce(
        (count, set) => count + set.size,
        0,
      ),
    };
  },
};
