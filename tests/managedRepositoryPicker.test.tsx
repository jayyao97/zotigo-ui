import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopProjectRepository, ManagedRepository } from "../shared/clientTypes";
import { ManagedRepositoryPicker, RepositoryBaseField, repositoryBaseLabel } from "../src/ManagedRepositoryPicker";

const repository: ManagedRepository = {
  id: "repo-one", name: "one", remote_url: "https://example.com/one.git", default_branch: "trunk",
  canonical_path: "/managed/one", created_at: "2026-11-08T00:00:00Z", updated_at: "2026-11-08T00:00:00Z",
};

function mount() {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  return { root, cleanup: async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of Object.entries(previous)) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
  } };
}

test("repository picker reuses a library entry and prevents adding an already linked repository", async () => {
  const { root, cleanup } = mount();
  let selected: string[] = [];
  const client = { listRepositories: async () => [repository], createRepository: async () => repository };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={client} selectedIds={selected} onChange={ids => { selected = ids; }} />));
    assert.match(document.body.textContent!, /one.*https:\/\/example.com\/one.git.*trunk/);
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    assert.deepEqual(selected, ["repo-one"]);
    await act(async () => root.render(<ManagedRepositoryPicker client={client} selectedIds={[]} linkedIds={[repository.id]} onChange={ids => { selected = ids; }} />));
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    assert.equal(checkbox.checked, true);
    assert.equal(checkbox.disabled, true);
    assert.match(document.body.textContent!, /Already added/);
  } finally { await cleanup(); }
});

test("repository picker ignores late results from another host and surfaces retryable errors", async () => {
  const { root, cleanup } = mount();
  let finishOld!: (items: ManagedRepository[]) => void;
  let shouldFail = true;
  const oldClient = { listRepositories: () => new Promise<ManagedRepository[]>(resolve => { finishOld = resolve; }), createRepository: async () => repository };
  const newClient = { listRepositories: async () => { if (shouldFail) throw new Error("Host is offline"); return [{ ...repository, name: "new-host" }]; }, createRepository: async () => repository };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={oldClient} />));
    await act(async () => root.render(<ManagedRepositoryPicker client={newClient} />));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Host is offline/);
    await act(async () => finishOld([repository]));
    assert.equal(document.querySelector(".managed-repository-row"), null);
    shouldFail = false;
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Reload"]')!.click());
    assert.match(document.body.textContent!, /new-host/);
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally { await cleanup(); }
});

test("repository search matches names and remote addresses without losing hidden selections", async () => {
  const { root, cleanup } = mount();
  const other = { ...repository, id: "repo-two", name: "Shared Library", remote_url: "git@example.com:team/library.git" };
  const client = { listRepositories: async () => [repository, other], createRepository: async () => repository };
  let selected = [repository.id];
  const filter = async (value: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={client} selectedIds={selected} onChange={ids => { selected = ids; }} />));
    await filter("  SHARED  ");
    assert.equal(document.querySelectorAll(".managed-repository-row").length, 1);
    assert.match(document.querySelector(".managed-repository-row")!.textContent!, /Shared Library/);
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    assert.deepEqual(selected, [repository.id, other.id]);
    await act(async () => root.render(<ManagedRepositoryPicker client={client} selectedIds={selected} onChange={ids => { selected = ids; }} />));
    await filter("EXAMPLE.COM/ONE");
    assert.equal(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, true);
    await filter("not-present");
    assert.equal(document.querySelectorAll(".managed-repository-row").length, 0);
    assert.match(document.querySelector('[role="status"]')!.textContent!, /No matching/);
    await filter("");
    assert.equal(document.querySelectorAll('input[type="checkbox"]:checked').length, 2);
  } finally { await cleanup(); }
});

test("managed base branch follows the remote by default and can restore automatic selection", async () => {
  const { root, cleanup } = mount();
  const source: DesktopProjectRepository = {
    id: "source", project_id: "project", repository_id: repository.id, remote_url: repository.remote_url,
    repo_key: "key", name: "one", source_path: "/managed/one", git_common_dir: "/managed/one/.git",
    default_base_ref: "trunk", availability: "available", created_at: repository.created_at, updated_at: repository.updated_at,
  };
  let changed: string | undefined;
  try {
    await act(async () => root.render(<RepositoryBaseField repository={source} value="" onChange={value => { changed = value; }} />));
    assert.equal(document.querySelector<HTMLInputElement>("input")!.value, "", "auto selection must not pin a potentially stale branch name");
    assert.match(document.querySelector<HTMLInputElement>("input")!.placeholder, /trunk/);
    assert.match(repositoryBaseLabel({ ...source, default_base_ref: "" }, ""), /Remote default branch/);
    await act(async () => root.render(<RepositoryBaseField repository={source} value="release" onChange={value => { changed = value; }} />));
    await act(async () => document.querySelector<HTMLButtonElement>("button")!.click());
    assert.equal(changed, "");
    assert.equal(repositoryBaseLabel(source, "release"), "release");
  } finally { await cleanup(); }
});
