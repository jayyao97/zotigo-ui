import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { FavoriteModelSettings } from "../src/FavoriteModelSettings";
import { ModelFavoritesProvider, useSavedModelFavorites } from "../src/modelFavorites";
import { ClientContext } from "../src/ClientContext";
import type { ClientApi } from "../shared/clientTypes";

test("settings add and remove persisted favorites and update mounted consumers without changing a session", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://zotigo.test" });
  const replacements = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  let requestedDirectory: string | undefined;
  const api = {
    getAgents: async () => ({ agents: [{ id: "codex", label: "Codex" }] }),
    prepareCodex: async () => ({ id: "codex", label: "Codex", models: [{ id: "model-a", display_name: "Model A", is_default: true, supported_reasoning_efforts: ["medium", "high"] }] }),
    getDesktopState: async () => ({ selectedWorkspaceId: "workspace", workspaces: [{ id: "workspace", root_path: "/workspace" }] }),
    getProfiles: async (directory?: string) => { requestedDirectory = directory; return { profiles: [], default_profile: "" }; },
  } as unknown as ClientApi;
  function Consumer() { const { items } = useSavedModelFavorites(); return <output>{JSON.stringify(items)}</output>; }
  const render = async (host: string) => { await act(async () => root.render(<ClientContext.Provider value={{ api, kind: "web" }}><ModelFavoritesProvider key={host} host={host}><FavoriteModelSettings hostName={host} /><Consumer /></ModelFavoritesProvider></ClientContext.Provider>)); };
  try {
    await render("local");
    assert.equal(requestedDirectory, "/workspace");
    const add = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => add.click());
    assert.match(document.querySelector("output")!.textContent!, /model-a/);
    assert.equal(add.disabled, true);
    assert.match(localStorage.getItem("zotigo.model-favorites.v1:local")!, /medium/);
    await render("remote");
    assert.equal(document.querySelector("output")!.textContent, "[]");
    await render("local");
    assert.match(document.querySelector("output")!.textContent!, /model-a/);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label^="Remove favorite"]')!.click());
    assert.equal(document.querySelector("output")!.textContent, "[]");
    assert.equal(localStorage.getItem("zotigo.model-favorites.v1:local"), "[]");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
