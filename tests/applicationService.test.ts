import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { withConnection } from "../backend/hosts";
import { once } from "node:events";
import { createApplicationService, type NativeServices } from "../backend/applicationService";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import { createClientApi } from "../shared/clientApi";
import { createSelectionStore } from "../shared/catalogSelection";

function platform(overrides: Partial<NativeServices> = {}): NativeServices {
  const unexpected = async () => { throw new Error("Unexpected native operation"); };
  return { openPath: unexpected, openExternal: unexpected, downloadImage: unexpected, ...overrides };
}

test("Project deletion crosses the shared client boundary and clears only its own selection", async () => {
  const original = getDaemonConfig().baseUrl;
  let deleted = false;
  let rejectDelete = false;
  let receivedConfirmation: unknown;
  const project = { id: "p", name: "Project", created_at: "2026-01-01", updated_at: "2026-01-01" };
  const other = { ...project, id: "other", name: "Other project" };
  const daemon = createServer(async (request, response) => {
    let data: unknown = {};
    if (request.url === "/projects/p/delete-preview") data = {
      project_id: "p", workspace_ids: [], workspace_roots: [], dirty_worktree_paths: [],
      preserves_local_branches: true, preserves_remote_refs: true, preserves_source_directories: true, preserves_runtime_sessions: true,
    };
    if (request.url === "/projects/p/delete") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      receivedConfirmation = JSON.parse(Buffer.concat(chunks).toString()).confirmation;
      if (rejectDelete) {
        response.writeHead(409, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ code: "conflict", message: "workspace has active sessions" }));
        return;
      }
      deleted = true;
    }
    if (request.url === "/projects") data = { projects: deleted ? [other] : [project, other] };
    if (request.url === "/projects/p") data = { ...project, sources: [] };
    if (request.url === "/projects/other") data = { ...other, sources: [] };
    if (request.url === "/projects/p/workspaces") data = { workspaces: [] };
    if (request.url === "/projects/other/workspaces") data = { workspaces: [] };
    if (request.url === "/catalog/sessions") data = { sessions: [] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const selected = { projectId: "p", workspaceId: "w", sessionId: "s" };
  const selection = createSelectionStore(selected);
  const service = createApplicationService(platform(), () => {}, selection);
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      const result = await service.invoke(channel, JSON.parse(JSON.stringify(args)));
      if (!result.ok) throw new Error(result.error);
      return result.value as T;
    },
    onSessionEvent: () => () => {},
  });
  try {
    assert.deepEqual((await api.previewProjectDelete("p")).workspace_ids, []);
    rejectDelete = true;
    await assert.rejects(api.deleteProject({ id: "p", confirmation: "Project" }), /active sessions/);
    assert.deepEqual(selection.getCatalogSelection(), selected);
    rejectDelete = false;
    const state = await api.deleteProject({ id: "p", confirmation: "Project" });
    assert.equal(receivedConfirmation, "Project");
    assert.deepEqual(state.projects.map((item) => item.id), ["other"]);
    assert.deepEqual(selection.getCatalogSelection(), { projectId: null, workspaceId: null, sessionId: null });
    selection.setCatalogSelection({ projectId: "other", workspaceId: null, sessionId: null });
    await api.deleteProject({ id: "p", confirmation: "Project" });
    assert.equal(selection.getCatalogSelection().projectId, "other");
  } finally {
    service.dispose(); setDaemonBaseUrl(original);
    const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed;
  }
});

test("optional client arguments survive JSON transport without becoming explicit null", async () => {
  const calls: unknown[] = [];
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      calls.push(JSON.parse(JSON.stringify({ channel, args })));
      return undefined as T;
    },
    onSessionEvent: () => () => {},
  });
  await api.getProfiles();
  await api.listSkills("session");
  await api.listSessionItems("session");
  await api.selectConversation(null);
  await api.listSkills("session", false);
  assert.deepEqual(calls, [
    { channel: "daemon:get-profiles", args: [] },
    { channel: "daemon:list-skills", args: ["session"] },
    { channel: "sessions:list-items", args: ["session"] },
    { channel: "desktop:select-conversation", args: [null] },
    { channel: "daemon:list-skills", args: ["session", false] },
  ]);
});

test("new-session skills survive JSON transport with an omitted session and explicit reload", async () => {
  const original = getDaemonConfig().baseUrl;
  const requests: string[] = [];
  const daemon = createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", message: "", data: { skills: [], diagnostics: [] } }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const service = createApplicationService(platform(), () => {});
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      const result = await service.invoke(channel, JSON.parse(JSON.stringify(args)));
      if (!result.ok) throw new Error(result.error);
      return result.value as T;
    },
    onSessionEvent: () => () => {},
  });
  try {
    assert.deepEqual(await api.listSkills(undefined, true), { skills: [], diagnostics: [] });
    assert.deepEqual(requests, ["/skills?force_reload=true"]);
  } finally {
    service.dispose(); setDaemonBaseUrl(original);
    const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed;
  }
});

test("shared client mapping executes through the allowlisted application service", async () => {
  const service = createApplicationService(platform(), () => {});
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      const result = await service.invoke(channel, args);
      if (!result.ok) throw new Error(result.error);
      return result.value as T;
    },
    onSessionEvent: () => () => {},
  });
  await assert.rejects(api.chooseSourceFolders(), /directory browser UI/);
  assert.deepEqual(await api.openMarkdownLink({ href: "#heading", basePath: null, baseKind: "directory" }), { kind: "anchor", anchor: "heading" });
  assert.deepEqual(await service.invoke("__proto__", []), { ok: false, error: "Unknown application operation" });
  service.dispose();
});

test("shared boundary rejects invalid message and file inputs before reaching native or daemon services", async () => {
  const service = createApplicationService(platform(), () => {});
  for (const [channel, args] of [
    ["sessions:pause", ["id", ""]],
    ["desktop:send-conversation-message", [{ conversationId: "id", text: "" }]],
    ["desktop:save-text-file", [{ path: "/tmp/file", content: "text", expectedMtimeMs: "invalid" }]],
    ["desktop:download-image", ["https://example.com/image.png"]],
  ] as const) {
    const result = await service.invoke(channel, [...args]);
    assert.equal(result.ok, false, channel);
  }
  service.dispose();
});


test("directory browsing and literal file paths stay on the selected daemon", async () => {
  const seen: Array<{ url: string; token: string | undefined; body: unknown }> = [];
  const daemon = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    seen.push({ url: request.url!, token: request.headers.authorization, body: JSON.parse(body) });
    const data = request.url === "/files/open" ? { kind: "text", file: { path: "/remote/report#L12", name: "report#L12", content: "remote", sizeBytes: 6, mtimeMs: 1, readOnly: false } } : { path: "/remote", parentPath: null, entries: [], truncated: false };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  const connection = { id: "remote", name: "Remote", baseUrl: `http://127.0.0.1:${address.port}`, token: "directory-secret" };
  const service = createApplicationService(platform(), () => {});
  const api = createClientApi({ invoke: async <T>(channel: string, ...args: unknown[]) => {
    const result = await withConnection(connection, () => service.invoke(channel, args));
    if (!result.ok) throw new Error(result.error); return result.value as T;
  }, onSessionEvent: () => () => {} });
  try {
    await api.listDirectory({ path: "/remote", purpose: "files", sessionId: "session" });
    await api.listDirectory({ path: "", purpose: "sources" });
    assert.equal((await api.openTextFile("/remote/report#L12")).content, "remote");
    assert.deepEqual(seen, [
      { url: "/files/list", token: "Bearer directory-secret", body: { path: "/remote", sessionId: "session" } },
      { url: "/sources/directories", token: "Bearer directory-secret", body: { path: "" } },
      { url: "/files/open", token: "Bearer directory-secret", body: { path: "/remote/report#L12" } },
    ]);
    const rejected = await service.invoke("desktop:list-directory", [{ path: "/", purpose: "anything" }]);
    assert.equal(rejected.ok, false); assert.equal(seen.length, 3);
  } finally { service.dispose(); const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed; }
});
