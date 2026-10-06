import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useLiveFiles } from "../src/useLiveFiles";
import type { OpenFileState } from "../src/openFileState";
import type { ClientApi, WorkspaceFileOpenResult } from "../shared/clientTypes";
import type { FileEventEnvelope } from "../shared/fileEvents";

test("live files refresh clean previews, defer hidden tabs, protect drafts and reject stale reads", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const old = Object.fromEntries(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperties(globalThis, { window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document }, IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true } });
  const snapshot = (path: string, content: string) => ({ path, name: path, content, sizeBytes: content.length, mtimeMs: content.length, readOnly: false });
  const state = (path: string): OpenFileState => ({ kind: "text", file: snapshot(path, "before"), draft: "before", mode: "source", saveStatus: "clean" });
  let listener: (event: FileEventEnvelope) => void = () => {};
  let subscriptionId = ""; let stopped = 0;
  const requests: { path: string; resolve: (opened: WorkspaceFileOpenResult) => void; reject: (error: Error) => void }[] = [];
  const api = {
    onFileEvent: (fn: typeof listener) => { listener = fn; return () => { listener = () => {}; }; },
    subscribeFileEvents: async (id: string) => { subscriptionId = id; },
    unsubscribeFileEvents: async () => { stopped++; },
    openFile: (path: string) => new Promise<WorkspaceFileOpenResult>((resolve, reject) => requests.push({ path, resolve, reject })),
  } as unknown as ClientApi;
  let files: Record<string, OpenFileState> = {};
  let edit!: (draft: string) => void;
  let activate!: (path: string) => void;
  let refresh!: (path: string, discard?: boolean) => Promise<void>;
  function Harness() {
    const [value, setValue] = useState({ "/a": state("/a"), "/b": state("/b") });
    const ref = useRef<Record<string, OpenFileState>>(value); ref.current = value;
    const [path, setPath] = useState("/a"); activate = setPath;
    const switching = useRef(false);
    const live = useLiveFiles(api, value, ref, setValue as (value: Record<string, OpenFileState>) => void, path, switching);
    refresh = live.refresh; files = value;
    edit = (draft) => { const file = ref.current["/a"]; if (file.kind === "text") { const next = { ...ref.current, "/a": { ...file, draft, saveStatus: "dirty" as const } }; ref.current = next; setValue(next as typeof value); } };
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const emit = async (type: FileEventEnvelope["type"], paths: string[]) => act(async () => listener({ subscriptionId, type, paths }));
  const finish = async (content: string) => {
    const pending = requests.shift(); assert.ok(pending);
    await act(async () => pending.resolve({ kind: "text", file: snapshot(pending.path, content) }));
  };
  try {
    await act(async () => root.render(<Harness />));
    await emit("ready", []);
    assert.deepEqual(requests.map((item) => item.path), ["/a"]);
    await finish("updated");
    assert.equal(files["/a"].kind === "text" && files["/a"].file.content, "updated");
    await emit("changed", ["/b"]); assert.equal(requests.length, 0);
    await act(async () => activate("/b")); assert.equal(requests[0].path, "/b");
    await finish("background update");
    await act(async () => { activate("/a"); edit("my draft"); });
    await emit("changed", ["/a"]);
    const failed = requests.shift(); assert.ok(failed);
    await act(async () => failed.reject(new Error("Network timeout")));
    assert.equal(Boolean(files["/a"].diskChanged), false);
    assert.match(files["/a"].refreshError ?? "", /Network timeout/);
    assert.equal(files["/a"].saveStatus, "dirty");
    await emit("changed", ["/a"]); await finish("external edit");
    assert.equal(files["/a"].kind === "text" && files["/a"].draft, "my draft");
    assert.equal(files["/a"].diskChanged, true);
    // A confirmed reload must survive an already pending automatic read.
    await emit("changed", ["/a"]);
    await act(async () => { void refresh("/a", true); });
    assert.equal(requests.length, 1);
    await finish("external edit");
    assert.equal(requests.length, 1, "confirmed reload is queued after the automatic read");
    await finish("external edit");
    assert.equal(files["/a"].kind === "text" && files["/a"].draft, "external edit");
    await act(async () => edit("my draft"));
    await act(async () => { void refresh("/a", true); });
    // Edits made after clicking Refresh cannot be discarded by a delayed reply.
    await act(async () => edit("newer draft")); await finish("external edit");
    assert.equal(files["/a"].kind === "text" && files["/a"].draft, "newer draft");
    await act(async () => { void refresh("/a", true); }); await finish("external edit");
    assert.equal(files["/a"].kind === "text" && files["/a"].draft, "external edit");
    assert.equal(files["/a"].diskChanged, false);
    await emit("ready", []); assert.equal(requests[0].path, "/a"); await finish("reconnected");
    await act(async () => root.unmount()); assert.equal(stopped, 1);
  } finally {
    for (const [key, descriptor] of Object.entries(old)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
