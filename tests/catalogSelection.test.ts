import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createCatalogService } from "../backend/catalogService";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import { createSelectionStore } from "../shared/catalogSelection";
import { createBrowserSelection } from "../src/web/selection";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initializePreferencesStore, closePreferencesStore, setCatalogOrder } from "../backend/preferencesStore";
import type { NavigationItem } from "../shared/clientTypes";

test("legacy UI order imports new nodes first, and later clients use only daemon order", async () => {
  const original = getDaemonConfig().baseUrl;
  const directory = await mkdtemp(path.join(tmpdir(), "zotigo-navigation-"));
  initializePreferencesStore(directory);
  setCatalogOrder("projects", ["a"]);
  const projects = ["a", "b", "c"].map((id, index) => ({ id, name: id, created_at: `2026-01-0${index + 1}`, updated_at: "2026-01-01" }));
  let imported = false;
  let imports = 0;
  let projectOrder: NavigationItem[] = projects.map(({ id }) => ({ kind: "project", id }));
  const server = createServer(async (request, response) => {
    let data: unknown;
    if (request.url === "/catalog/navigation/import") {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { orders: Array<{ scope: string; items: NavigationItem[] }> };
      projectOrder = body.orders.find((order) => order.scope === "projects")!.items;
      imported = true; imports++;
      data = { ok: true };
    } else if (request.url === "/catalog/navigation") {
      data = { projects: projectOrder, workspaces: [], pinned: [], legacy_order_imported: imported };
    } else if (request.url === "/projects") data = { projects };
    else if (request.url?.endsWith("/workspaces")) data = { workspaces: [] };
    else if (request.url === "/catalog/sessions") data = { sessions: [] };
    else data = { ...projects.find((project) => request.url === `/projects/${project.id}`), sources: [] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  try {
    const first = await createCatalogService(createSelectionStore(null)).getCatalogDesktopState();
    assert.deepEqual(first.projects.map(({ id }) => id), ["c", "b", "a"]);
    setCatalogOrder("projects", ["a", "b", "c"]);
    const second = await createCatalogService(createSelectionStore(null)).getCatalogDesktopState();
    assert.deepEqual(second.projects.map(({ id }) => id), ["c", "b", "a"]);
    assert.equal(imports, 1);
  } finally {
    server.closeAllConnections(); server.close(); await once(server, "close");
    closePreferencesStore(); setDaemonBaseUrl(original);
    await rm(directory, { recursive: true, force: true });
  }
});

test("catalog clients share daemon data but never overwrite each other's selection", { timeout: 5000 }, async () => {
  const original = getDaemonConfig().baseUrl;
  const projects = ["a", "b"].map((id) => ({ id, name: id, created_at: "2026-01-01", updated_at: "2026-01-01" }));
  const server = createServer((request, response) => {
    const project = projects.find((item) => request.url === `/projects/${item.id}`);
    const data = request.url === "/catalog/navigation" ? { projects: [], workspaces: [], pinned: [], legacy_order_imported: true } : request.url === "/projects" ? { projects }
      : project ? { ...project, sources: [] }
        : request.url?.endsWith("/workspaces") ? { workspaces: [] } : { sessions: [] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "ok", data }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  const a = createCatalogService(createSelectionStore(null));
  const b = createCatalogService(createSelectionStore(null));
  try {
    await Promise.all([a.selectCatalogProject("a"), b.selectCatalogProject("b")]);
    const [stateA, stateB] = await Promise.all([a.getCatalogDesktopState(), b.getCatalogDesktopState()]);
    assert.deepEqual(stateA.projects, stateB.projects);
    assert.equal(stateA.selectedProjectId, "a");
    assert.equal(stateB.selectedProjectId, "b");
    await b.selectCatalogProject(null);
    assert.equal((await a.getCatalogDesktopState()).selectedProjectId, "a");
  } finally {
    server.closeAllConnections(); server.close(); await once(server, "close");
    setDaemonBaseUrl(original);
  }
});

test("project deletion clears the browser selection and ignores older refresh results", () => {
  const client = createBrowserSelection({ getItem: () => null, setItem: () => {} });
  const selected = { projectId: "p", workspaceId: "w", sessionId: "s" };
  const empty = { projectId: null, workspaceId: null, sessionId: null };
  client.begin("desktop:select-conversation").accept(selected);
  const refresh = client.begin("desktop:get-state");
  client.begin("desktop:delete-project").accept(empty);
  refresh.accept(selected);
  assert.deepEqual(client.begin("desktop:get-state").selection, empty);
});

test("browser selection survives reload and ignores late earlier choices and background snapshots", () => {
  let saved: string | null = null;
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  const client = createBrowserSelection(storage);
  const first = client.begin("desktop:select-conversation");
  const second = client.begin("desktop:select-conversation");
  const background = client.begin("desktop:get-state");
  const chosen = { projectId: "p", workspaceId: "w", sessionId: "b" };
  second.accept(chosen);
  first.accept({ ...chosen, sessionId: "a" });
  background.accept({ ...chosen, sessionId: "stale" });
  assert.deepEqual(client.begin("sessions:list").selection, chosen);
  assert.deepEqual(createBrowserSelection(storage).begin("desktop:get-state").selection, chosen);
  assert.deepEqual(createBrowserSelection({ getItem: () => null, setItem: () => {} }).begin("desktop:get-state").selection,
    { projectId: null, workspaceId: null, sessionId: null });
});

test("late ordinary and selection RPC values keep the current visible selection, including nested action results", async () => {
  const client = createBrowserSelection({ getItem: () => null, setItem: () => {} });
  const selectA = client.begin("desktop:select-conversation");
  selectA.accept({ projectId: "p", workspaceId: "w", sessionId: "a" });
  const pinA = client.begin("desktop:set-conversation-pinned");
  const selectB = client.begin("desktop:select-conversation");
  const selectionB = { projectId: "p", workspaceId: "w", sessionId: "b" };
  selectB.accept(selectionB);
  const oldState = { selectedProjectId: "p", selectedWorkspaceId: "w", selectedConversationId: "a", conversations: [{ id: "a", pinned_at: "now" }] };
  pinA.accept({ projectId: "p", workspaceId: "w", sessionId: "a" });
  assert.equal((await pinA.project(oldState)).selectedConversationId, "b");
  assert.deepEqual((await pinA.project(oldState)).conversations, oldState.conversations);
  assert.equal((await selectA.project({ state: oldState, command: { id: "sent" } })).state.selectedConversationId, "b");
  assert.deepEqual((await selectA.project({ state: oldState, command: { id: "sent" } })).command, { id: "sent" });
  assert.deepEqual(client.begin("desktop:get-state").selection, selectionB);
});

test("old catalog responses wait for a pending choice rather than undoing optimistic UI selection", async () => {
  const client = createBrowserSelection({ getItem: () => null, setItem: () => {} });
  const a = { projectId: "p", workspaceId: "w", sessionId: "a" };
  client.begin("desktop:select-conversation").accept(a);
  const pinA = client.begin("desktop:set-conversation-pinned");
  const chooseB = client.begin("desktop:select-conversation");
  pinA.accept(a);
  let delivered = false;
  const old = pinA.project({ selectedProjectId: "p", selectedWorkspaceId: "w", selectedConversationId: "a" }).then((value) => { delivered = true; return value; });
  await Promise.resolve();
  assert.equal(delivered, false);
  chooseB.accept({ ...a, sessionId: "b" });
  assert.equal((await old).selectedConversationId, "b");
  const failure = client.begin("desktop:select-conversation");
  const background = client.begin("desktop:get-state").project({ selectedProjectId: "p", selectedWorkspaceId: "w", selectedConversationId: "b" });
  failure.cancel();
  assert.equal((await background).selectedConversationId, "b");
});
