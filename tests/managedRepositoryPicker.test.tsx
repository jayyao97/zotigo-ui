import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopProjectRepository, ManagedRepository, RepositoryBranch } from "../shared/clientTypes";
import { ManagedRepositoryPicker, RepositoryBaseField } from "../src/ManagedRepositoryPicker";

const repository: ManagedRepository = {
  id: "repo-one", name: "one", remote_url: "https://example.com/one.git", default_branch: "trunk",
  canonical_path: "/managed/one", last_synced_at: "2026-11-08T00:00:00Z", created_at: "2026-11-08T00:00:00Z", updated_at: "2026-11-08T00:00:00Z",
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

test("repository cache status distinguishes available stale code from an unsynced repository", async () => {
  const { root, cleanup } = mount();
  const cached = { ...repository, last_synced_at: "2026-11-08T00:00:00Z", last_sync_error: "remote unavailable" };
  const uncached = { ...repository, id: "no-cache", name: "no-cache", last_synced_at: undefined, last_sync_error: "clone failed" };
  const client = { listRepositories: async () => [cached, uncached], createRepository: async () => repository };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={client} />));
    const notices = [...document.querySelectorAll(".repository-sync-status")];
    assert.match(notices[0].textContent!, /cached version.*2026.*available/);
    assert.equal(notices[0].getAttribute("title"), "remote unavailable");
    assert.match(notices[1].textContent!, /no successfully synced version yet/);
    assert.equal(document.querySelectorAll('[role="alert"]').length, 0, "cached refresh failure is not a failed form operation");
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

test("repository registration releases busy on client replacement and ignores stale completion", async () => {
  const { root, cleanup } = mount();
  let finishOld!: (item: ManagedRepository) => void;
  let finishNew!: (item: ManagedRepository) => void;
  const oldClient = { listRepositories: async () => [], createRepository: () => new Promise<ManagedRepository>(resolve => { finishOld = resolve; }) };
  const newClient = { listRepositories: async () => [], createRepository: () => new Promise<ManagedRepository>(resolve => { finishNew = resolve; }) };
  const busy: boolean[] = [];
  const selected: string[][] = [];
  const props = { onBusyChange: (value: boolean) => busy.push(value), onChange: (ids: string[]) => selected.push(ids) };
  const register = async () => {
    if (!document.querySelector(".managed-repository-add")) {
      await act(async () => document.querySelector<HTMLButtonElement>(".managed-repository-add-button")!.click());
    }
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(".managed-repository-add input")!;
      input.value = repository.remote_url;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>(".managed-repository-add .dialog-submit")!.click());
  };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={oldClient} {...props} />));
    await register();
    assert.deepEqual(busy, [true]);
    await act(async () => root.render(<ManagedRepositoryPicker client={newClient} {...props} />));
    assert.deepEqual(busy, [true, false]);
    await register();
    assert.deepEqual(busy, [true, false, true]);
    await act(async () => finishOld(repository));
    assert.deepEqual(busy, [true, false, true], "old completion must not release the new registration");
    assert.deepEqual(selected, []);
    assert.equal(document.querySelector<HTMLButtonElement>(".managed-repository-add .dialog-submit")!.disabled, true);
    await act(async () => root.render(<></>));
    assert.deepEqual(busy, [true, false, true, false]);
    await act(async () => finishNew(repository));
    assert.deepEqual(selected, []);
    assert.deepEqual(busy, [true, false, true, false]);
  } finally { await cleanup(); }
});

test("base branch defaults automatically and lists only readable remote branches", async () => {
  const { root, cleanup } = mount();
  const source = { id: "source", project_id: "project", repository_id: repository.id, default_base_ref: "main" } as DesktopProjectRepository;
  let changed = "";
  const client = { listRepositoryBranches: async () => [
    { name: "release", ref: "refs/remotes/origin/release", kind: "remote" as const },
    { name: "main", ref: "refs/remotes/origin/main", kind: "remote" as const },
    { name: "unpublished", ref: "refs/zotigo/imported/source/heads/unpublished", kind: "imported" as const },
  ] };
  try {
    await act(async () => root.render(<RepositoryBaseField client={client} repository={source} value="" onChange={value => { changed = value; }} />));
    assert.equal(document.querySelector("input"), null);
    assert.equal(document.querySelectorAll("select").length, 1);
    assert.equal(document.querySelectorAll("option").length, 2, "do not list the default branch twice");
    assert.match(document.body.textContent!, /main \(default\)/);
    assert.doesNotMatch(document.body.textContent!, /refs\/|unpublished|snapshot/);
    assert.equal(document.querySelector("select")!.value, "");
    await act(async () => {
      const select = document.querySelector("select")!;
      select.value = "refs/remotes/origin/release";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(changed, "refs/remotes/origin/release", "submit exact ref but show the short name");
    await act(async () => {
      const select = document.querySelector("select")!;
      select.value = "";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(changed, "");
  } finally { await cleanup(); }
});

test("branch loading failure preserves automatic default selection", async () => {
  const { root, cleanup } = mount();
  const source = { id: "source", project_id: "project", default_base_ref: "HEAD" } as DesktopProjectRepository;
  try {
    await act(async () => root.render(<RepositoryBaseField client={{ listRepositoryBranches: async () => { throw new Error("offline"); } }} repository={source} value="HEAD" onChange={() => {}} />));
    assert.equal(document.querySelector("select")!.value, "HEAD");
    assert.equal(document.querySelector("select")!.disabled, false);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /default branch/);
  } finally { await cleanup(); }
});

test("an explicit branch remains visible while its list reload fails", async () => {
  const { root, cleanup } = mount();
  const source = { id: "source", project_id: "project", repository_id: "managed", default_base_ref: "main" } as DesktopProjectRepository;
  const value = "refs/remotes/origin/release";
  try {
    await act(async () => root.render(<RepositoryBaseField client={{ listRepositoryBranches: async () => { throw new Error("offline"); } }} repository={source} value={value} onChange={() => {}} />));
    const select = document.querySelector("select")!;
    assert.equal(select.value, value);
    assert.equal(select.selectedOptions[0].textContent, "release");
    assert.doesNotMatch(document.body.textContent!, /refs\//);
  } finally { await cleanup(); }
});

test("branch choices discard late responses from another daemon", async () => {
  const { root, cleanup } = mount();
  const source = { id: "source", project_id: "project", name: "one" } as DesktopProjectRepository;
  let resolveOld!: (branches: RepositoryBranch[]) => void;
  const oldClient = { listRepositoryBranches: () => new Promise<RepositoryBranch[]>(resolve => { resolveOld = resolve; }) };
  const newClient = { listRepositoryBranches: async () => [{ name: "new-host", ref: "refs/heads/new-host", kind: "local" as const }] };
  try {
    await act(async () => root.render(<RepositoryBaseField client={oldClient} repository={source} value="HEAD" onChange={() => {}} />));
    await act(async () => root.render(<RepositoryBaseField client={newClient} repository={source} value="HEAD" onChange={() => {}} />));
    await act(async () => resolveOld([{ name: "old-host", ref: "refs/heads/old-host", kind: "local" }]));
    assert.match(document.querySelector("select")!.textContent!, /new-host/);
    assert.doesNotMatch(document.querySelector("select")!.textContent!, /old-host/);
  } finally { await cleanup(); }
});

test("background preparation releases the dialog and enables selection only after polling succeeds", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { root, cleanup } = mount();
  let listCalls = 0;
  let ready = false;
  const pending = { ...repository, last_synced_at: undefined };
  const busy: boolean[] = [];
  const selected: string[][] = [];
  const client = { listRepositories: async () => { listCalls++; return listCalls === 1 ? [] : [ready ? repository : pending]; }, createRepository: async () => pending };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={client} onBusyChange={value => busy.push(value)} onChange={ids => selected.push(ids)} />));
    await act(async () => document.querySelector<HTMLButtonElement>(".managed-repository-add-button")!.click());
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(".managed-repository-add input")!;
      input.value = repository.remote_url;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>(".managed-repository-add .dialog-submit")!.click());
    assert.deepEqual(busy, [true, false]);
    assert.deepEqual(selected, []);
    assert.match(document.body.textContent!, /Preparing in the background/);
    assert.equal(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled, true);
    ready = true;
    await act(async () => context.mock.timers.tick(3000));
    assert.equal(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled, false);
    assert.deepEqual(selected, [], "ready repositories remain an explicit user choice");
    await act(async () => context.mock.timers.tick(9000));
    assert.equal(listCalls, 2, "polling stops after preparation completes");
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    assert.deepEqual(selected, [[repository.id]]);
  } finally { await cleanup(); }
});

test("pending polling recovers after connection and preparation failures without reopening", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { root, cleanup } = mount();
  let calls = 0;
  const client = { listRepositories: async () => {
    calls++;
    if (calls === 2) throw new Error("Temporary disconnect");
    if (calls === 3) return [{ ...repository, last_synced_at: undefined, last_sync_error: "Clone failed; retry pending" }];
    return [calls >= 4 ? repository : { ...repository, last_synced_at: undefined }];
  }, createRepository: async () => repository };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={client} onChange={() => {}} />));
    await act(async () => context.mock.timers.tick(3000));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Temporary disconnect/);
    await act(async () => context.mock.timers.tick(3000));
    assert.equal(calls, 2, "failed requests back off");
    await act(async () => context.mock.timers.tick(27000));
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled, true);
    await act(async () => context.mock.timers.tick(30000));
    assert.equal(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled, false);
    await act(async () => context.mock.timers.tick(60000));
    assert.equal(calls, 4, "ready repositories stop polling");
  } finally { await cleanup(); }
});

test("pending polling stops on unmount and cannot replace another host's repositories", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { root, cleanup } = mount();
  let calls = 0;
  let resolvePoll!: (items: ManagedRepository[]) => void;
  const oldClient = { listRepositories: async () => {
    calls++;
    return calls === 1 ? [{ ...repository, last_synced_at: undefined }] : new Promise<ManagedRepository[]>(resolve => { resolvePoll = resolve; });
  }, createRepository: async () => repository };
  const newClient = { listRepositories: async () => [{ ...repository, name: "new-host" }], createRepository: async () => repository };
  try {
    await act(async () => root.render(<ManagedRepositoryPicker client={oldClient} />));
    await act(async () => context.mock.timers.tick(3000));
    assert.equal(calls, 2);
    await act(async () => root.render(<ManagedRepositoryPicker client={newClient} />));
    await act(async () => resolvePoll([{ ...repository, name: "old-host" }]));
    assert.match(document.body.textContent!, /new-host/);
    assert.doesNotMatch(document.body.textContent!, /old-host/);
    await act(async () => root.render(<ManagedRepositoryPicker client={oldClient} />));
    await act(async () => resolvePoll([{ ...repository, last_synced_at: undefined }]));
    await act(async () => root.render(<></>));
    await act(async () => context.mock.timers.tick(9000));
    assert.equal(calls, 3, "unmount cancels pending preparation polling");
  } finally { await cleanup(); }
});
