import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import {
  addCatalogWorkspaceSource,
  createCatalogWorkspace,
  createSession,
  changeSessionCodexSettings,
  getAgents,
  getSession,
  inspectCatalogSource,
  isMessageDuringActiveTurnError,
  listCatalogProjects,
  listCatalogWorkspaceSources,
  listCatalogSessions,
  listSkills,
  listSessionItems,
  pauseSession,
  prepareCodex,
  previewCatalogWorkspaceDelete,
  renameCatalogProject,
  renameCatalogWorkspace,
  sendSessionMessage,
  setDaemonBaseUrl,
  ZotigodRequestError,
} from "../backend/zotigod";

let server: http.Server;
const requests: Array<{ method?: string; url?: string; body?: unknown }> = [];
const timestamp = new Date(0).toISOString();
const semanticWorkspaceRoot = "/tmp/projects/zotigo-11111111/workspaces/protocol-move-22222222";
const semanticWorkspaceBranch = "zotigo/protocol-move-22222222";

before(async () => {
  server = http.createServer(async (request, response) => {
    const body = await readJSONBody(request);
    requests.push({ method: request.method, url: request.url, body });
    if (request.method === "GET" && request.url === "/projects") {
      return writeOK(response, { projects: [{ id: "project-1", name: "Zotigo", created_at: timestamp, updated_at: timestamp }] });
    }
    if (request.method === "PUT" && request.url === "/projects/project-1") {
      return writeOK(response, { id: "project-1", name: "Renamed", created_at: timestamp, updated_at: timestamp });
    }
    if (request.method === "POST" && request.url === "/projects/project-1/workspaces") {
      return writeOK(response, workspace(), 201);
    }
    if (request.method === "PUT" && request.url === "/workspaces/workspace-1") {
      return writeOK(response, { ...workspace(), title: "Renamed Workspace" });
    }
    if (request.method === "GET" && request.url === "/workspaces/workspace-1/sources") {
      return writeOK(response, { sources: [workspaceSource()] });
    }
    if (request.method === "POST" && request.url === "/workspaces/workspace-1/sources") {
      return writeOK(response, workspaceSource(), 201);
    }
    if (request.method === "POST" && request.url === "/sources/inspect") {
      return writeOK(response, {
        kind: "git",
        canonical_path: "/tmp/source",
        git_common_dir: "/tmp/source/.git",
        git_object_format: "sha1",
        source_key: "git:/tmp/source/.git",
      });
    }
    if (request.method === "POST" && request.url === "/sessions") {
      return writeOK(response, body && typeof body === "object" && "agent" in body ? codexSession() : session(), 201);
    }
    if (request.method === "GET" && request.url === "/agents") {
      return writeOK(response, agentCatalog());
    }
    if (request.method === "GET" && request.url === "/skills?session_id=session-1&force_reload=true") {
      return writeOK(response, {
        skills: [{ name: "review-taste", description: "Review code quality", scope: "workspace", enabled: true }],
        diagnostics: [],
      });
    }
    if (request.method === "POST" && request.url === "/agents/codex/prepare") {
      return writeOK(response, codexAgent("available"));
    }
    if (request.method === "PUT" && request.url === "/sessions/session-codex/codex-settings") {
      return writeOK(response, codexSession());
    }
    if (request.method === "GET" && request.url === "/sessions/session-occupied") {
      return writeOK(response, {
        ...codexSession(),
        id: "session-occupied",
        state: "failed",
        error: "thread already has an active writer",
        error_code: "runtime_occupied",
        working: true,
        active_tool: "shell",
        context_usage: { tokens: 52000, window: 200000, status: "available", source: "provider" },
      });
    }
    if (request.method === "GET" && request.url === "/sessions/session-1/items") {
      return writeOK(response, {
        items: [{
          id: "item-1", sequence: 1, type: "assistant_message", role: "assistant", created_at: timestamp,
          content: [{
            type: "tool_result",
            tool_result: {
              tool_call_id: "spawn-1", tool_name: "spawn", result_type: "text", text: "done",
              metadata: { subagent: { name: "review", status: "completed", history: [] } },
            },
          }],
        }, {
          id: "item-2", sequence: 2, type: "context_compacted", created_at: timestamp,
          context_compaction: {
            original_tokens: 183421, compressed_tokens: 91736,
            messages_before: 108, messages_after: 19,
          },
        }],
        next_cursor: "", prev_cursor: "", has_more: false,
      });
    }
    if (request.method === "POST" && request.url === "/sessions/session-1/pause") {
      return writeOK(response, {
        id: "pause-1",
        sequence: 3,
        type: "pause",
        turn_id: "turn-1",
        reason: "user_requested",
        created_at: timestamp,
      }, 202);
    }
    if (request.method === "POST" && request.url === "/sessions/session-occupied/messages") {
      return writeError(response, 409, "runtime_occupied", "runtime session is open in another application");
    }
    if (request.method === "POST" && request.url === "/sessions/session-1/messages") {
      return writeOK(response, {
        id: "message-1",
        sequence: 3,
        type: "message",
        text: "review this",
        skills: ["review-taste"],
        created_at: timestamp,
      }, 202);
    }
    if (request.method === "GET" && (request.url === "/catalog/sessions" || request.url === "/catalog/sessions?sync_codex=true")) {
      return writeOK(response, {
        sessions: [{
          runtime: { ...session(), context_usage: { status: "unavailable" } },
          organization: organization(),
          availability: "ready",
        }],
      });
    }
    if (request.method === "GET" && request.url === "/workspaces/workspace-1/delete-preview") {
      return writeOK(response, {
        workspace_id: "workspace-1",
        session_ids: ["session-1"],
        workspace_root: semanticWorkspaceRoot,
        worktree_paths: [`${semanticWorkspaceRoot}/code/repo`],
        dirty_worktree_paths: [],
        local_branches: [semanticWorkspaceBranch],
        preserves_sources: true,
        preserves_runtime_sessions: true,
        preserves_remote_refs: true,
      });
    }
    writeOK(response, { message: "not found" }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("uses zotigod catalog endpoints for projects and workspace provisioning", async () => {
  assert.equal((await listCatalogProjects())[0]?.name, "Zotigo");
  const created = await createCatalogWorkspace("project-1", "Protocol move", [{ source_id: "source-1", base_ref: "main" }]);
  assert.equal(created.root_path, semanticWorkspaceRoot);
  assert.deepEqual(requests.at(-1), {
    method: "POST",
    url: "/projects/project-1/workspaces",
    body: { title: "Protocol move", sources: [{ source_id: "source-1", base_ref: "main" }] },
  });
});

test("inspects a Source without requiring a Project", async () => {
  const inspection = await inspectCatalogSource("/tmp/source");
  assert.equal(inspection.kind, "git");
  assert.deepEqual(requests.at(-1), {
    method: "POST",
    url: "/sources/inspect",
    body: { path: "/tmp/source" },
  });
});

test("lists and adds daemon-owned Workspace Source bindings", async () => {
  const sources = await listCatalogWorkspaceSources("workspace-1");
  assert.equal(sources[0]?.branch_name, "feature/custom");
  await addCatalogWorkspaceSource("workspace-1", { source_id: "source-1", base_ref: "main", branch_name: "feature/custom" });
  assert.deepEqual(requests.at(-1), {
    method: "POST",
    url: "/workspaces/workspace-1/sources",
    body: { source_id: "source-1", base_ref: "main", branch_name: "feature/custom" },
  });
});

test("renames a Project through zotigod", async () => {
  const project = await renameCatalogProject("project-1", "Renamed");
  assert.equal(project.name, "Renamed");
  assert.deepEqual(requests.at(-1), {
    method: "PUT",
    url: "/projects/project-1",
    body: { name: "Renamed" },
  });
});

test("renames a Workspace through zotigod", async () => {
  const workspace = await renameCatalogWorkspace("workspace-1", "Renamed Workspace");
  assert.equal(workspace.title, "Renamed Workspace");
  assert.deepEqual(requests.at(-1), {
    method: "PUT",
    url: "/workspaces/workspace-1",
    body: { title: "Renamed Workspace" },
  });
});

test("assigns new sessions by workspace id instead of a Desktop-derived cwd", async () => {
  await createSession({ workspaceId: "workspace-1", approvalPolicy: "auto" });
  assert.deepEqual(requests.at(-1)?.body, { workspace_id: "workspace-1", approval_policy: "auto" });
});

test("discovers Codex and sends runtime settings when creating sessions", async () => {
  const catalog = await getAgents();
  assert.equal(catalog.agents[1]?.id, "codex");
  const codex = await prepareCodex();
  assert.equal(codex.models?.[0]?.id, "gpt-5.6-luna");

  const created = await createSession({
    workspaceId: "workspace-1",
    agent: "codex",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
  });
  assert.equal(created.agent, "codex");
  assert.deepEqual(requests.at(-1)?.body, {
    workspace_id: "workspace-1",
    agent: "codex",
    model: "gpt-5.6-luna",
    reasoning_effort: "medium",
  });

  await changeSessionCodexSettings("session-codex", { model: "gpt-5.6-luna", reasoningEffort: "high" });
  assert.deepEqual(requests.at(-1)?.body, { model: "gpt-5.6-luna", reasoning_effort: "high" });
});

test("lists session skills and sends an explicit skill selection", async () => {
  const response = await listSkills("session-1", true);
  assert.deepEqual(response.skills, [{
    name: "review-taste",
    description: "Review code quality",
    scope: "workspace",
    enabled: true,
  }]);

  const command = await sendSessionMessage("session-1", "review this", [], ["review-taste"]);
  assert.deepEqual(command.skills, ["review-taste"]);
  assert.deepEqual(requests.at(-1), {
    method: "POST",
    url: "/sessions/session-1/messages",
    body: { text: "review this", skills: ["review-taste"] },
  });
});

test("parses daemon-owned session organization and destructive previews", async () => {
  const projections = await listCatalogSessions();
  assert.equal(requests.at(-1)?.url, "/catalog/sessions");
  assert.equal(projections[0]?.organization?.workspace_id, "workspace-1");
  assert.equal(projections[0]?.runtime?.working_directory, semanticWorkspaceRoot);
  assert.equal(projections[0]?.runtime?.updated_at, timestamp);
  assert.equal(projections[0]?.runtime?.context_usage, undefined);
  assert.equal(projections[0]?.organization?.pinned_position, 1000);
  const impact = await previewCatalogWorkspaceDelete("workspace-1");
  assert.equal(impact.root_path, semanticWorkspaceRoot);
  assert.deepEqual(impact.local_branches, [semanticWorkspaceBranch]);
  assert.equal(impact.preserves_runtime_sessions, true);
});

test("Codex catalog synchronization is explicit", async () => {
  await listCatalogSessions({ syncCodex: true });
  assert.equal(requests.at(-1)?.url, "/catalog/sessions?sync_codex=true");
});

test("preserves the runtime occupied code in sessions and request errors", async () => {
  const session = await getSession("session-occupied");
  assert.equal(session.error_code, "runtime_occupied");
  assert.equal(session.working, true);
  assert.equal(session.active_tool, "shell");
  assert.deepEqual(session.context_usage, { tokens: 52000, window: 200000 });

  await assert.rejects(
    sendSessionMessage("session-occupied", "hello"),
    (error: unknown) => error instanceof ZotigodRequestError
      && error.status === 409
      && error.code === "runtime_occupied",
  );
});

test("recognizes active-turn message conflicts that should retry as steering", () => {
  assert.equal(isMessageDuringActiveTurnError(
    new ZotigodRequestError(409, "Conflict", "message requires an idle session", "active_turn"),
  ), true);
  assert.equal(isMessageDuringActiveTurnError(
    new ZotigodRequestError(409, "Conflict", "runtime occupied", "runtime_occupied"),
  ), false);
});

test("preserves structured subagent metadata in display items", async () => {
  const page = await listSessionItems("session-1");
  assert.equal(page.items[0]?.content?.[0]?.tool_result?.metadata?.subagent &&
    (page.items[0].content![0].tool_result!.metadata!.subagent as { name?: string }).name, "review");
});

test("preserves context compaction metrics in display items", async () => {
  const page = await listSessionItems("session-1");
  assert.deepEqual(page.items[1]?.context_compaction, {
    original_tokens: 183421,
    compressed_tokens: 91736,
    messages_before: 108,
    messages_after: 19,
  });
});

test("pauses the active turn through the public session endpoint", async () => {
  const command = await pauseSession("session-1", "turn-1");
  assert.equal(command.type, "pause");
  assert.equal(command.turn_id, "turn-1");
  assert.deepEqual(requests.at(-1), {
    method: "POST",
    url: "/sessions/session-1/pause",
    body: { turn_id: "turn-1" },
  });
});

function session() {
  return {
    id: "session-1",
    state: "created",
    live: true,
    working_directory: semanticWorkspaceRoot,
    profile: "default",
    approval_policy: "auto",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function codexSession() {
  return {
    ...session(),
    id: "session-codex",
    profile: undefined,
    approval_policy: "bypass_permissions",
    agent: "codex",
    model: "gpt-5.6-luna",
    reasoning_effort: "medium",
  };
}

function agentCatalog() {
  return { default_agent: "zotigo", agents: [zotigoAgent(), codexAgent("installed")] };
}

function zotigoAgent() {
  return {
    id: "zotigo",
    label: "Zotigo",
    availability: "available",
    capabilities: { profiles: true, models: false, steering: true, approvals: true },
  };
}

function codexAgent(availability: "installed" | "available") {
  return {
    id: "codex",
    label: "Codex",
    availability,
    version: "codex-test",
    capabilities: { profiles: false, models: true, steering: true, approvals: false },
    models: availability === "available" ? [{
      id: "gpt-5.6-luna",
      display_name: "Luna",
      is_default: true,
      supported_reasoning_efforts: ["medium", "high"],
    }] : undefined,
  };
}

function workspace() {
  return {
    id: "workspace-1",
    project_id: "project-1",
    title: "Protocol move",
    root_path: semanticWorkspaceRoot,
    status: "ready",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function workspaceSource() {
  return {
    source: {
      id: "source-1",
      project_id: "project-1",
      kind: "git",
      canonical_path: "/tmp/source",
      git_common_dir: "/tmp/source/.git",
      git_object_format: "sha1",
      source_key: "repo",
      created_at: timestamp,
      updated_at: timestamp,
    },
    target_path: `${semanticWorkspaceRoot}/code/repo`,
    worktree_path: `${semanticWorkspaceRoot}/code/repo`,
    base_ref: "main",
    base_commit: "abc123",
    branch_name: "feature/custom",
    status: "ready",
  };
}

function organization() {
  return {
    session_id: "session-1",
    project_id: "project-1",
    workspace_id: "workspace-1",
    title: "Protocol move",
    pinned_at: timestamp,
    pinned_position: 1000,
    workspace_position: 1000,
    self_archived_at: null,
    workspace_archived_at: null,
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

async function readJSONBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function writeOK(response: http.ServerResponse, data: unknown, status = 200): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ code: status >= 400 ? "not_found" : "ok", data }));
}

function writeError(response: http.ServerResponse, status: number, code: string, message: string): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ code, message }));
}
