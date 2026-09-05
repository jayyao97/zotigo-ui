import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createCatalogService } from "../backend/catalogService";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import { createSelectionStore } from "../shared/catalogSelection";
import { createBrowserSelection } from "../src/web/selection";

test("catalog clients share daemon data but never overwrite each other's selection", { timeout: 5000 }, async () => {
  const original = getDaemonConfig().baseUrl;
  const projects = ["a", "b"].map((id) => ({ id, name: id, created_at: "2026-01-01", updated_at: "2026-01-01" }));
  const server = createServer((request, response) => {
    const project = projects.find((item) => request.url === `/projects/${item.id}`);
    const data = request.url === "/projects" ? { projects }
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
