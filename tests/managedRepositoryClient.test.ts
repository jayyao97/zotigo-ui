import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { withConnection } from "../backend/hosts";
import { createApplicationService } from "../backend/applicationService";
import { addCatalogRepository, addCatalogWorkspaceSource, createCatalogWorkspace, getCatalogProject } from "../backend/zotigod";
import { parseProjectSources } from "../backend/projectInputValidation";
import { createClientApi } from "../shared/clientApi";

test("project sources accept repository references and reject ambiguous local inputs", () => {
  assert.deepEqual(parseProjectSources([{ repositoryId: " repo-1 " }, { path: "/local" }]), [
    { repositoryId: "repo-1" }, { path: "/local", folderMode: undefined },
  ]);
  for (const value of [{}, { repositoryId: "" }, { repositoryId: "r", path: "/local" }, { repositoryId: "r", folderMode: "copy" }]) {
    assert.throws(() => parseProjectSources([value]));
  }
});

test("repository mutations wait for daemon Git phases instead of the default fetch headers deadline", async () => {
  const originalDispatcher = getGlobalDispatcher();
  const shortDeadline = new Agent({ headersTimeout: 10 });
  const requests: Array<{ path: string; auth: string | undefined }> = [];
  const source = { id: "source", project_id: "project", kind: "git", canonical_path: "/repo", source_key: "key", created_at: "now", updated_at: "now" };
  const data = {
    ...source, name: "repo", remote_url: "https://example.com/repo.git", default_branch: "main",
    title: "workspace", root_path: "/workspace", status: "ready", source, target_path: "/workspace/code/repo",
    used_cached_base: true, base_synced_at: "2026-11-08T00:00:00Z",
  };
  const server = createServer((request, response) => {
    requests.push({ path: request.url!, auth: request.headers.authorization });
    const timer = setTimeout(() => response.end(JSON.stringify({ code: "ok", data })), 1500);
    response.on("close", () => clearTimeout(timer));
    request.resume();
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    setGlobalDispatcher(shortDeadline);
    await assert.rejects(fetch(baseUrl + "/baseline"), "the short default deadline must actually expire");
    await withConnection({ id: "long-operations", name: "long-operations", baseUrl, token: "test-token" }, async () => {
      await Promise.all([
        addCatalogRepository("project", "repo"),
        createCatalogWorkspace("project", "workspace", [{ source_id: "source" }]),
        addCatalogWorkspaceSource("workspace", { source_id: "source" }).then(binding => {
          assert.equal(binding.used_cached_base, true);
          assert.equal(binding.base_synced_at, data.base_synced_at);
        }),
      ]);
    });
    assert.deepEqual(requests.slice(1).map(request => request.path).sort(), ["/projects/project/sources", "/projects/project/workspaces", "/workspaces/workspace/sources"].sort());
    assert.ok(requests.slice(1).every(request => request.auth === "Bearer test-token"));
  } finally {
    setGlobalDispatcher(originalDispatcher);
    await shortDeadline.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("repository operations share IPC/Web contract and remain bound to their daemon", async () => {
  const received: Array<{ host: string; method: string; url: string; auth?: string; body: unknown }> = [];
  const repository = { id: "repo-1", name: "app", remote_url: "git@example.com:team/app.git", default_branch: "trunk", canonical_path: "/managed/app", last_synced_at: "2026-11-08T00:00:00Z", last_sync_error: "remote unavailable", created_at: "now", updated_at: "now" };
  const source = { id: "source-1", project_id: "project-1", kind: "git", canonical_path: "/managed/app", source_key: "key", repository_id: repository.id, remote_url: repository.remote_url, default_branch: repository.default_branch, last_synced_at: repository.last_synced_at, last_sync_error: repository.last_sync_error, created_at: "now", updated_at: "now" };
  const daemons = ["alpha", "beta"].map(host => createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    received.push({ host, method: request.method!, url: request.url!, auth: request.headers.authorization, body: text ? JSON.parse(text) : undefined });
    const data = request.url?.endsWith("/branches") ? { branches: [{ name: "local-work", ref: "refs/zotigo/imported/source/heads/local-work", kind: "imported", source_name: "checkout" }] }
      : request.url === "/repositories" ? request.method === "GET" ? { repositories: [repository] } : repository
      : request.method === "GET" ? { id: "project-1", name: "Project", created_at: "now", updated_at: "now", sources: [source] } : source;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ code: "ok", data }));
  }));
  await Promise.all(daemons.map(async daemon => { daemon.listen(0, "127.0.0.1"); await once(daemon, "listening"); }));
  const service = createApplicationService({ openPath: async () => {}, openExternal: async () => {}, downloadImage: async () => {} }, () => {});
  const connections = daemons.map((daemon, index) => {
    const address = daemon.address(); assert.ok(address && typeof address !== "string");
    return { id: String(index), name: String(index), baseUrl: `http://127.0.0.1:${address.port}`, token: `secret-${index}` };
  });
  const clients = connections.map(connection => createClientApi({
    invoke: async <T,>(channel: string, ...args: unknown[]): Promise<T> => {
      const response = await withConnection(connection, () => service.invoke(channel, args));
      if (!response.ok) throw new Error(response.error);
      return response.value as T;
    }, onFileEvent: () => () => {}, onSessionEvent: () => () => {},
  }));
  try {
    const [listed, created] = await Promise.all([clients[0].listRepositories(), clients[1].createRepository({ remoteUrl: repository.remote_url })]);
    assert.deepEqual(listed, [repository]); assert.deepEqual(created, repository);
    const branches = await clients[0].listRepositoryBranches("project-1", "source-1");
    assert.deepEqual(branches, [{ name: "local-work", ref: "refs/zotigo/imported/source/heads/local-work", kind: "imported", source_name: "checkout" }]);
    assert.ok(received.some(request => request.url === "/projects/project-1/sources/source-1/branches" && request.host === "alpha" && request.auth === "Bearer secret-0"));
    assert.ok(received.some(request => request.host === "alpha" && request.method === "GET" && request.auth === "Bearer secret-0"));
    assert.ok(received.some(request => request.host === "beta" && request.method === "POST" && request.auth === "Bearer secret-1"));
    assert.deepEqual(received.find(request => request.method === "POST")?.body, { remote_url: repository.remote_url });
    await withConnection(connections[0], () => addCatalogRepository("project-1", "repo-1"));
    assert.deepEqual(received.at(-1)?.body, { repository_id: "repo-1" });
    const detail = await withConnection(connections[0], () => getCatalogProject("project-1"));
    assert.equal(detail.sources[0].default_branch, "trunk");
    assert.equal(detail.sources[0].repository_id, "repo-1");
    assert.equal(detail.sources[0].last_synced_at, repository.last_synced_at);
    assert.equal(detail.sources[0].last_sync_error, "remote unavailable");
  } finally {
    service.dispose();
    await Promise.all(daemons.map(daemon => new Promise<void>(resolve => daemon.close(() => resolve()))));
  }
});
