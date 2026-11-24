import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { withConnection, initializeHosts, saveHost } from "../backend/hosts";
import { once } from "node:events";
import { createApplicationService, type NativeServices } from "../backend/applicationService";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import { createClientApi } from "../shared/clientApi";
import { createSelectionStore } from "../shared/catalogSelection";

function platform(overrides: Partial<NativeServices> = {}): NativeServices {
  const unexpected = async () => { throw new Error("Unexpected native operation"); };
  return { openPath: unexpected, openExternal: unexpected, downloadImage: unexpected, ...overrides };
}

test("explicit settings destinations override the workbench host without changing its context", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "settings-hosts-"));
  initializeHosts(directory);
  const received: Array<{host:string;url:string;auth:string|undefined}> = [];
  const daemons = ["first","second"].map(host => createServer(async (request,response) => {
    for await (const _chunk of request) { /* Consume the real HTTP request body. */ }
    received.push({host,url:request.url!,auth:request.headers.authorization});
    const data = request.url === "/updates" ? {component:"daemon",version:"1.0.0",commit:host,custom:false,channel:"stable",phase:"idle"}
      : request.url === "/config/models/test" ? {ok:true} : {revision:"r",default_profile:"",profiles:[]};
    response.setHeader("Content-Type","application/json");response.end(JSON.stringify({code:"ok",data}));
  }));
  const service = createApplicationService(platform(),()=>{});
  try {
    for (const daemon of daemons) {daemon.listen(0,"127.0.0.1");await once(daemon,"listening");}
    const hosts = daemons.map((daemon,index) => {
      const address = daemon.address();assert.ok(address && typeof address !== "string");
      return saveHost({name:["first","second"][index],baseUrl:`http://127.0.0.1:${address.port}`,token:`secret-${index}`});
    });
    const outside = {...hosts[0],token:"secret-0"};
    const change = {action:"save",revision:"r",profile:{name:"saved",provider:"openai",model:"test",base_url:"",thinking_level:"",context_window:0,max_output_tokens:null,mode:"",has_api_key:false}};
    const replies = await withConnection(outside, () => Promise.all([
      service.invoke("updates:component",["daemon","check",null,hosts[1].id]),
      service.invoke("daemon:get-model-settings",[hosts[1].id]),
      service.invoke("daemon:update-model-settings",[change,hosts[1].id]),
      service.invoke("daemon:test-model-settings",[change,hosts[1].id]),
      service.invoke("updates:component",["daemon","status"]),
    ]));
    assert.ok(replies.every(reply=>reply.ok),JSON.stringify(replies));
    assert.equal(received.filter(r=>r.host==="second" && r.auth==="Bearer secret-1").length,4);
    assert.deepEqual(received.filter(r=>r.host==="first"),[{host:"first",url:"/updates",auth:"Bearer secret-0"}]);
    const rejected = await service.invoke("daemon:get-model-settings",["missing-host"]);
    assert.equal(rejected.ok,false);
    assert.equal(received.length,5,"unknown hosts must not fall back to the active host");
  } finally {
    service.dispose();
    await Promise.all(daemons.map(daemon=>new Promise<void>(resolve=>daemon.close(()=>resolve()))));
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test("only missing update endpoints are reported as unsupported", async () => {
  let statusCode = 404;
  const daemon = createServer((_request,response) => {response.writeHead(statusCode);response.end("fixture error");});
  daemon.listen(0,"127.0.0.1"); await once(daemon,"listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  const connection = {id:"fixture",name:"fixture",baseUrl:`http://127.0.0.1:${address.port}`,token:"fixture"};
  const service = createApplicationService(platform(),()=>{});
  const request = () => withConnection(connection,()=>service.invoke("updates:component",["daemon","status"]));
  try {
    for (const code of [404,405]) {
      statusCode=code; const reply=await request(); assert.equal(reply.ok,false);
      assert.match(JSON.stringify(reply),/does not support the update API/);
    }
    statusCode=503; const unavailable=await request(); assert.equal(unavailable.ok,false);
    assert.doesNotMatch(JSON.stringify(unavailable),/installer|does not support/);
    await new Promise<void>(resolve=>daemon.close(()=>resolve()));
    const offline=await request(); assert.equal(offline.ok,false);
    assert.doesNotMatch(JSON.stringify(offline),/installer|does not support/);
  } finally {service.dispose();daemon.close();}
});

test("update requests retain their remote host and credentials while client updates stay local", async () => {
  const received: Array<{host: string; authorization: string | undefined; body: unknown}> = [];
  const daemons = ["alpha", "beta"].map(host => createServer(async (request, response) => {
    assert.equal(request.url, "/updates");
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push({host, authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString())});
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({code:"ok", data:{component:"daemon",version:"1.0.0",commit:host,custom:false,channel:"development",phase:"idle"}}));
  }));
  for (const daemon of daemons) { daemon.listen(0, "127.0.0.1"); await once(daemon, "listening"); }
  let localCalls = 0;
  const service = createApplicationService(platform({ updateClient: async () => {
    localCalls++; return {component:"desktop",version:"1.0.0",commit:"local",custom:false,channel:"stable",phase:"idle"};
  }}), () => {});
  const connections = daemons.map((daemon, index) => {
    const address = daemon.address(); assert.ok(address && typeof address !== "string");
    const id = ["alpha", "beta"][index];
    return {id, name:id, baseUrl:`http://127.0.0.1:${address.port}`, token:`token-${id}`};
  });
  try {
    const replies = await Promise.all(connections.map(connection => withConnection(connection, () => service.invoke("updates:component", ["daemon", "channel", "development"]))));
    assert.ok(replies.every(reply => reply.ok));
    assert.deepEqual(received.sort((a,b) => a.host.localeCompare(b.host)), connections.map(connection => ({host:connection.id, authorization:`Bearer ${connection.token}`, body:{action:"channel",channel:"development"}})));
    const local = await withConnection(connections[1], () => service.invoke("updates:component", ["client", "status"]));
    assert.equal(local.ok, true); assert.equal(localCalls, 1); assert.equal(received.length, 2);
  } finally {
    service.dispose();
    await Promise.all(daemons.map(daemon => new Promise<void>(resolve => daemon.close(() => resolve()))));
  }
});

test("Project deletion crosses the shared client boundary and clears only its own selection", async () => {
  const original = getDaemonConfig().baseUrl;
  let deleted = false;
  let rejectDelete = false;
  let receivedConfirmation: unknown;
  const project = { id: "p", name: "Project", created_at: "2026-01-01", updated_at: "2026-01-01" };
  const other = { ...project, id: "other", name: "Other project" };
  const daemon = createServer(async (request, response) => {
    if (request.url === "/catalog/snapshot?sessions=none") { response.writeHead(404); response.end(); return; }
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
    if (request.url === "/catalog/navigation") data = { projects: [], workspaces: [], pinned: [], legacy_order_imported: true };
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
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
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

test("interaction answers preserve exact values across the application boundary", async () => {
  const original = getDaemonConfig().baseUrl;
  let received: unknown;
  const daemon = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data: {
      id: "interaction", session_id: "session", turn_id: "turn", kind: "user_input", status: "resolved",
      questions: [{ id: "secret", question: "Token" }], answers: { secret: ["[redacted]"] }, is_blocking: true,
    } }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  try {
    const result = await service.invoke("sessions:submit-interaction", ["session", "interaction", { " secret ": ["user_note:   keep whitespace  "] }]);
    assert.equal(result.ok, true);
    assert.deepEqual(received, { answers: { " secret ": ["user_note:   keep whitespace  "] } });
    const unanswered = await service.invoke("sessions:submit-interaction", ["session", "interaction", { optional: [] }]);
    assert.equal(unanswered.ok, true);
    assert.deepEqual(received, { answers: { optional: [] } });
  } finally {
    service.dispose(); setDaemonBaseUrl(original);
    const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed;
  }
});

test("interaction answers preserve an opaque __proto__ question id", async () => {
  const original = getDaemonConfig().baseUrl;
  let received: unknown;
  const daemon = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data: {
      id: "interaction", session_id: "session", turn_id: "turn", kind: "user_input", status: "resolved",
      questions: [{ id: "__proto__", question: "Value" }], answers: { redacted: ["[redacted]"] }, is_blocking: true,
    } }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  try {
    const answers = Object.fromEntries([["__proto__", ["opaque value"]]]);
    const result = await service.invoke("sessions:submit-interaction", ["session", "interaction", answers]);
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn((received as { answers: object }).answers, "__proto__"), true);
    assert.deepEqual((received as { answers: Record<string, string[]> }).answers["__proto__"], ["opaque value"]);
  } finally {
    service.dispose(); setDaemonBaseUrl(original);
    const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed;
  }
});

test("Codex conversation creation forwards the selected approval policy", async () => {
  const original = getDaemonConfig().baseUrl;
  let createBody: unknown;
  const daemon = createServer(async (request, response) => {
    if (request.url === "/catalog/snapshot?sessions=none") { response.writeHead(404); response.end(); return; }
    if (request.method === "POST" && request.url === "/sessions") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      createBody = JSON.parse(Buffer.concat(chunks).toString());
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: "invalid_request", message: "captured" }));
      return;
    }
    const data = request.url === "/catalog/navigation" ? { projects: [], workspaces: [], pinned: [], legacy_order_imported: true } : request.url === "/projects" ? { projects: [] } : { sessions: [] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  try {
    const result = await service.invoke("desktop:create-conversation", [{
      projectId: null, agent: "codex",
      model: "gpt-5.6-luna", reasoningEffort: "max", approvalPolicy: "bypass_permissions",
    }]);
    assert.equal(result.ok, true);
    assert.deepEqual(createBody, {
      agent: "codex", model: "gpt-5.6-luna", reasoning_effort: "max", approval_policy: "bypass_permissions",
    });
    assert.equal((result as { value?: { deliveryState?: string } }).value?.deliveryState, "rejected", "a refused create leaves nothing behind");
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
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  });
  await api.getProfiles();
  await api.getProfiles(undefined, "global");
  await api.listSkills("session");
  await api.listSessionItems("session");
  await api.selectConversation(null);
  await api.listSkills("session", false);
  assert.deepEqual(calls, [
    { channel: "daemon:get-profiles", args: [] },
    { channel: "daemon:get-profiles", args: [null, "global"] },
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
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
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
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  });
  await assert.rejects(api.chooseSourceFolders(), /directory browser UI/);
  assert.deepEqual(await api.openMarkdownLink({ href: "#heading", basePath: null, baseKind: "directory" }), { kind: "anchor", anchor: "heading" });
  assert.deepEqual(await service.invoke("__proto__", []), { ok: false, error: "Unknown application operation" });
  service.dispose();
});

test("file opening falls back only when an older backend does not know the new operation", async () => {
  const calls: string[] = [];
  const snapshot = { path: "/workspace/notes.md", name: "notes.md", content: "legacy", sizeBytes: 6, mtimeMs: 1, readOnly: false };
  const api = createClientApi({
    invoke: async <T>(channel: string) => {
      calls.push(channel);
      if (channel === "desktop:open-file") throw new Error("Unknown application operation");
      return snapshot as T;
    },
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  });
  assert.deepEqual(await api.openFile(snapshot.path), { kind: "text", file: snapshot });
  assert.deepEqual(calls, ["desktop:open-file", "desktop:open-text-file"]);

  const failedCalls: string[] = [];
  const failing = createClientApi({
    invoke: async (channel) => {
      failedCalls.push(channel);
      throw new Error("Path does not exist.");
    },
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  });
  await assert.rejects(failing.openFile(snapshot.path), /Path does not exist/);
  assert.deepEqual(failedCalls, ["desktop:open-file"]);
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
    const requestedPath = (seen.at(-1)?.body as { path?: string }).path;
    const data = request.url === "/files/open"
      ? requestedPath === "/remote/pixel.png"
        ? { kind: "image", file: { path: requestedPath, name: "pixel.png", mediaType: "image/png", dataBase64: "iVBORw0KGgo=", sizeBytes: 8, mtimeMs: 2 } }
        : { kind: "text", file: { path: "/remote/report#L12", name: "report#L12", content: "remote", sizeBytes: 6, mtimeMs: 1, readOnly: false } }
      : { path: "/remote", parentPath: null, entries: [], truncated: false };
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
  }, onFileEvent: () => () => {}, onSessionEvent: () => () => {} });
  try {
    await api.listDirectory({ path: "/remote", purpose: "files", sessionId: "session" });
    await api.listDirectory({ path: "", purpose: "sources" });
    const opened = await api.openFile("/remote/report#L12");
    assert.equal(opened.kind, "text");
    if (opened.kind === "text") assert.equal(opened.file.content, "remote");
    const image = await api.openFile("/remote/pixel.png", "session");
    assert.equal(image.kind, "image");
    if (image.kind === "image") {
      assert.equal(image.file.mediaType, "image/png");
      assert.equal(image.file.dataBase64, "iVBORw0KGgo=");
    }
    const legacy = await withConnection(connection, () => service.invoke("desktop:open-text-file", ["/remote/report#L12"]));
    assert.equal(legacy.ok, true);
    if (legacy.ok) assert.equal((legacy.value as { content: string }).content, "remote");
    assert.deepEqual(seen, [
      { url: "/files/list", token: "Bearer directory-secret", body: { path: "/remote", sessionId: "session" } },
      { url: "/sources/directories", token: "Bearer directory-secret", body: { path: "" } },
      { url: "/files/open", token: "Bearer directory-secret", body: { path: "/remote/report#L12", includeVideo: true } },
      { url: "/files/open", token: "Bearer directory-secret", body: { path: "/remote/pixel.png", sessionId: "session", includeVideo: true } },
      { url: "/files/open", token: "Bearer directory-secret", body: { path: "/remote/report#L12", includeVideo: true } },
    ]);
    const rejected = await service.invoke("desktop:list-directory", [{ path: "/", purpose: "anything" }]);
    assert.equal(rejected.ok, false); assert.equal(seen.length, 5);
  } finally { service.dispose(); const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed; }
});

test("explicit local links preview outside text read-only and never launch unsupported files", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "explicit-preview-"));
  const oldUrl = getDaemonConfig().baseUrl;
  const daemon = createServer((request, response) => {
    if (request.url === "/catalog/snapshot?sessions=none") { response.writeHead(404); response.end(); return; }
    const data = request.url === "/catalog/navigation" ? { projects: [], workspaces: [], pinned: [], legacy_order_imported: true } : request.url === "/projects" ? { projects: [] } : { sessions: [] };
    response.end(JSON.stringify({ code: "ok", data }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  let launched = false;
  const service = createApplicationService(platform({ openPath: async () => { launched = true; } }), () => {});
  try {
    const text = path.join(root, "outside.txt"); const binary = path.join(root, "outside.bin");
    await fs.writeFile(text, "read me"); await fs.writeFile(binary, Buffer.from([0, 1, 2]));
    const result = await service.invoke("desktop:open-markdown-link", [{ href: text, basePath: null, baseKind: "directory" }]);
    assert.ok(result.ok);
    assert.equal((result.value as {file:{readOnly:boolean}}).file.readOnly, true);
    const blocked = await service.invoke("desktop:open-markdown-link", [{ href: binary, basePath: null, baseKind: "directory" }]);
    assert.equal(blocked.ok, false); assert.equal(launched, false);
  } finally {service.dispose();setDaemonBaseUrl(oldUrl);daemon.close();await fs.rm(root,{recursive:true,force:true});}
});

test("prompt identity survives the client boundary and message-to-steering fallback before the reply", async () => {
  const { optimisticPromptDisplayItem, reconcileOptimisticSteering } = await import("../shared/sessionDisplay");
  const original = getDaemonConfig().baseUrl;
  let steering = false;
  let catalogRequests = 0;
  const received: string[] = [];
  let pending = [optimisticPromptDisplayItem({ id: "optimistic-prompt-once", text: "same text", steering: false, createdAt: "2026-01-01T00:00:00Z" })];
  const daemon = createServer(async (request, response) => {
    if (request.url?.startsWith("/catalog/") || request.url === "/projects") catalogRequests++;
    if (request.url === "/catalog/snapshot?sessions=none") { response.writeHead(404); response.end(); return; }
    let data: unknown = {};
    if (request.url === "/sessions/s" && request.method === "GET") data = { id: "s", state: "running", approval_policy: "auto", live: true, working: true, created_at: "2026-01-01T00:00:00Z" };
    if (request.method === "POST") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      received.push(body.client_message_id);
      if (steering && request.url === "/sessions/s/messages") {
        response.writeHead(409, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ code: "active_turn", message: "active turn" }));
        return;
      }
      // The durable stream/poll update can reach the UI before the POST response.
      pending = reconcileOptimisticSteering(pending, [{
        id: body.client_message_id, sequence: 1, type: steering ? "steering_message" : "user_message",
        created_at: "2026-01-01T00:00:00Z",
      }]);
      data = { id: body.client_message_id, sequence: 1, type: steering ? "steering" : "message", text: body.text, created_at: "2026-01-01T00:00:00Z" };
    }
    if (request.url === "/projects") data = { projects: [] };
    if (request.url === "/catalog/sessions") data = { sessions: [] };
    if (request.url === "/catalog/navigation") data = { projects: [], workspaces: [], pinned: [], legacy_order_imported: true };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      const result = await service.invoke(channel, JSON.parse(JSON.stringify(args)));
      if (!result.ok) throw new Error(result.error);
      return result.value as T;
    },
    onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  });
  try {
    for (const useSteering of [false, true]) {
      steering = useSteering;
      pending = [optimisticPromptDisplayItem({ id: "optimistic-prompt-once", text: "same text", steering, createdAt: "2026-01-01T00:00:00Z" })];
      const result = await api.sendConversationMessage({ conversationId: "s", clientMessageId: pending[0].id, text: "same text" });
      assert.equal(result.error, undefined);
      assert.equal(result.command?.id, "optimistic-prompt-once");
      assert.deepEqual(pending, []);
    }
    assert.deepEqual(received, Array(3).fill("optimistic-prompt-once"));
    assert.equal(catalogRequests, 0, "send acknowledgement must not wait for a catalog refresh");
  } finally {
    setDaemonBaseUrl(original);
    daemon.close(); await once(daemon, "close");
  }
});

test("a catalog failure after creation is not reported as a rejected create", async () => {
  const original = getDaemonConfig().baseUrl;
  const session = { id: "new", state: "created", approval_policy: "auto", created_at: "2026-01-01", workspace_position: -1 };
  const daemon = createServer((request, response) => {
    if (request.url === "/catalog/snapshot?sessions=none") { response.writeHead(404); response.end(); return; }
    if (request.url === "/sessions/new/title") {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: "invalid_request", message: "title refused" }));
      return;
    }
    const data = request.url === "/sessions" ? session
      : request.url === "/catalog/navigation" ? { projects: [], workspaces: [], pinned: [], legacy_order_imported: true }
      : request.url === "/projects" ? { projects: [] } : { sessions: [] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  try {
    const result = await service.invoke("desktop:create-conversation", [{ projectId: null, workspaceId: "workspace" }]);
    const value = (result as { value?: { error?: string; deliveryState?: string } }).value;
    assert.match(value?.error ?? "", /title refused/);
    assert.equal(value?.deliveryState, undefined, "the session already exists");
  } finally {
    service.dispose(); setDaemonBaseUrl(original);
    const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed;
  }
});

// A daemon double for first-message delivery. Responses to /messages can be held or failed.
async function firstMessageDaemon(options: { failFirstSend?: boolean; forbidRefreshAfterSend?: boolean } = {}) {
  const session = { id: "new", state: "created", approval_policy: "auto", created_at: "2026-01-01", workspace_position: -1 };
  const projection = { runtime: session, organization: null, availability: "available" };
  const counts = { snapshot: 0, uploads: 0, start: 0 };
  const messages: Array<{ client_message_id?: string; text?: string }> = [];
  let release: () => void = () => {};
  let refreshPending = false;
  const sendHeld = new Promise<void>(resolve => { release = resolve; });
  const daemon = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const reply = (data: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(status === 200 ? { code: "ok", data } : { code: "internal_error", message: "worker failed" })); };
    const url = request.url ?? "";
    if (url === "/catalog/snapshot?sessions=none") { counts.snapshot++; response.writeHead(404); response.end(); return; }
    if (url.startsWith("/files/upload")) { counts.uploads++; return reply({ path: `/uploads/${counts.uploads}/notes.txt` }); }
    if (url === "/sessions/new/start") { counts.start++; return reply({ ...session, state: "running" }); }
    if (url === "/sessions/new/messages") {
      messages.push(JSON.parse(Buffer.concat(chunks).toString()));
      refreshPending = Boolean(options.forbidRefreshAfterSend);
      await sendHeld;
      if (options.failFirstSend && messages.length === 1) return reply(null, 500);
      return reply({ id: messages.at(-1)!.client_message_id, sequence: 1, type: "message", created_at: "2026-01-01" });
    }
    // Only the read that follows an accepted message is refused.
    if (url === "/sessions/new" && refreshPending) {
      refreshPending = false;
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: "forbidden", message: "refresh denied" }));
      return;
    }
    switch (url) {
      case "/sessions": return reply(session);
      case "/sessions/new": return reply(session);
      case "/sessions/new/title": case "/catalog/sessions/new": return reply(projection);
      case "/projects": return reply({ projects: [] });
      case "/catalog/navigation": return reply({ projects: [], workspaces: [], pinned: [], legacy_order_imported: true });
      case "/catalog/sessions": return reply({ sessions: [projection] });
      default: response.writeHead(404); response.end();
    }
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  return { url: `http://127.0.0.1:${address.port}`, counts, messages, release: () => release(),
    close: async () => { const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed; } };
}

const firstMessage = { clientMessageId: "optimistic-prompt-1", text: "hello", skills: [], images: [] };
type Invoked = { ok: boolean; value?: { session?: { id: string }; state?: { selectedConversationId: string | null }; command?: { id: string }; error?: string; deliveryState?: string } };

test("creation returns before its first message is delivered, reading the catalog once", async () => {
  const daemon = await firstMessageDaemon();
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  const host = { id: "dev", name: "dev", baseUrl: daemon.url, token: "" };
  try {
    const created = await withConnection(host, () => service.invoke("desktop:create-conversation", [{ projectId: null, workspaceId: "workspace", message: firstMessage }])) as Invoked;
    assert.equal(created.value?.session?.id, "new");
    assert.equal(created.value?.state?.selectedConversationId, "new");
    assert.equal(daemon.counts.snapshot, 1, "the success path reuses the state selection already returned");
    assert.equal(daemon.messages.length, 1, "delivery is already on its way");
    let settled = false;
    const outcome = withConnection(host, () => service.invoke("desktop:wait-first-message", [firstMessage.clientMessageId])).then(value => { settled = true; return value as Invoked; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(settled, false, "the create response did not wait for the send");
    daemon.release();
    assert.equal((await outcome).value?.command?.id, firstMessage.clientMessageId);
    assert.equal(daemon.messages[0].client_message_id, firstMessage.clientMessageId);
    assert.equal(daemon.counts.start, 1);
    // Another host never sees, or retries, this host's message.
    const elsewhere = { ...host, id: "local", baseUrl: "http://127.0.0.1:1" };
    const foreign = await withConnection(elsewhere, () => service.invoke("desktop:wait-first-message", [firstMessage.clientMessageId])) as Invoked;
    assert.equal(foreign.value?.deliveryState, "unknown");
    assert.equal(daemon.messages.length, 1);
  } finally {
    service.dispose();
    await daemon.close();
  }
});

test("an accepted send stays confirmed when the follow-up session refresh fails", async () => {
  const daemon = await firstMessageDaemon({ forbidRefreshAfterSend: true });
  daemon.release();
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  const host = { id: "dev", name: "dev", baseUrl: daemon.url, token: "" };
  try {
    await withConnection(host, () => service.invoke("desktop:create-conversation", [{ projectId: null, workspaceId: "workspace", message: firstMessage }]));
    const outcome = await withConnection(host, () => service.invoke("desktop:wait-first-message", [firstMessage.clientMessageId])) as Invoked;
    assert.equal(outcome.value?.error, undefined, "the refresh is not part of delivery");
    assert.equal(outcome.value?.deliveryState, undefined);
    assert.equal(outcome.value?.command?.id, firstMessage.clientMessageId, "the accepted command is kept");
    assert.equal(outcome.value?.session?.id, "new");
    // A later message to an existing session follows the same rule.
    const sent = await withConnection(host, () => service.invoke("desktop:send-conversation-message", [{ conversationId: "new", clientMessageId: "optimistic-prompt-2", text: "again" }])) as Invoked;
    assert.equal(sent.value?.error, undefined);
    assert.equal(sent.value?.command?.id, "optimistic-prompt-2");
    assert.equal(daemon.messages.length, 2);
  } finally {
    service.dispose();
    await daemon.close();
  }
});

test("a first-message retry reuses the uploaded text and message id", async () => {
  const daemon = await firstMessageDaemon({ failFirstSend: true });
  daemon.release();
  const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
  const host = { id: "dev", name: "dev", baseUrl: daemon.url, token: "" };
  const message = { ...firstMessage, files: [{ name: "notes.txt", mime_type: "text/plain", data_base64: Buffer.from("notes").toString("base64") }] };
  try {
    await withConnection(host, () => service.invoke("desktop:create-conversation", [{ projectId: null, workspaceId: "workspace", message }]));
    const first = await withConnection(host, () => service.invoke("desktop:wait-first-message", [message.clientMessageId])) as Invoked;
    assert.equal(first.value?.deliveryState, "unknown", "a 5xx may follow admission");
    const retried = await withConnection(host, () => service.invoke("desktop:retry-first-message", [{ ...message, conversationId: "new" }])) as Invoked;
    assert.equal(retried.value?.command?.id, message.clientMessageId);
    assert.equal(daemon.counts.uploads, 1, "the retry does not upload again");
    assert.equal(daemon.messages.length, 2);
    assert.deepEqual(daemon.messages[1], daemon.messages[0], "identical input under the same id lets the daemon run it once");
    // A retry after confirmation returns the accepted command without another send.
    const again = await withConnection(host, () => service.invoke("desktop:retry-first-message", [{ ...message, conversationId: "new" }])) as Invoked;
    assert.equal(again.value?.command?.id, message.clientMessageId);
    assert.equal(daemon.messages.length, 2);
  } finally {
    service.dispose();
    await daemon.close();
  }
});

test("creation selects the session without starting a worker or sending a message", async () => {
  const original = getDaemonConfig().baseUrl;
  for (const serverPosition of [undefined, -123456789, 0]) {
    let reorderCount = 0;
    let workerTouched = false;
    const session = { id: "new", state: "created", approval_policy: "auto", created_at: "2026-01-01" };
    const projection = { runtime: session, organization: null, availability: "available" };
    const daemon = createServer((request, response) => {
    if (request.url === "/catalog/snapshot?sessions=none") { response.writeHead(404); response.end(); return; }
      let data: unknown;
      switch (request.url) {
        case "/sessions": data = { ...session, workspace_position: serverPosition }; break;
        case "/sessions/new/title": data = projection; break;
        case "/sessions/new/position": reorderCount++; data = projection; break;
        case "/projects": data = { projects: [] }; break;
        case "/catalog/navigation": data = { projects: [], workspaces: [], pinned: [], legacy_order_imported: true }; break;
        case "/catalog/sessions/new": data = projection; break;
        case "/catalog/sessions": data = { sessions: [projection] }; break;
        case "/sessions/new/start": case "/sessions/new/messages": workerTouched = true; data = session; break;
        default: response.writeHead(404); response.end(); return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: "ok", data }));
    });
    daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
    const address = daemon.address(); assert.ok(address && typeof address !== "string");
    setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
    const service = createApplicationService(platform(), () => {}, createSelectionStore({ projectId: null, workspaceId: null, sessionId: null }));
    try {
      const result = await service.invoke("desktop:create-conversation", [{ projectId: null, workspaceId: "workspace" }]);
      assert.equal(result.ok, true);
      const value = (result as { value?: { session?: { id: string }; state?: { selectedConversationId: string | null } } }).value;
      assert.equal(value?.session?.id, "new", JSON.stringify(result));
      assert.equal(value?.state?.selectedConversationId, "new");
      assert.equal(workerTouched, false, "the worker starts with the first message");
      // Server positions are preserved; only legacy daemons need a reorder.
      assert.equal(reorderCount, serverPosition === undefined ? 1 : 0);
    } finally {
      service.dispose(); setDaemonBaseUrl(original);
      const closed = once(daemon, "close"); daemon.close(); daemon.closeAllConnections(); await closed;
    }
  }
});
