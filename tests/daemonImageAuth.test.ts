import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Session } from "electron";
import { configureDaemonImageAuth } from "../electron/daemonImageAuth";
import { initializeHosts, saveHost, deleteHost } from "../backend/hosts";
import { getDaemonConfig } from "../backend/zotigod";

test("Chromium image auth covers previews/downloads and blocks redirects outside daemon images", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-image-auth-"));
  const previousFile = process.env.ZOTIGOD_AUTH_TOKEN_FILE;
  const previousUrl = process.env.ZOTIGOD_URL;
  type Details = { id: number; url: string; requestHeaders: Record<string, string> };
  type Result = { cancel?: boolean; requestHeaders?: Record<string, string> };
  type Listener = (details: Details, callback: (result: Result) => void) => void;
  const listeners: Record<string, Listener> = {};
  const webRequest = Object.fromEntries(["onBeforeRequest", "onBeforeSendHeaders", "onCompleted", "onErrorOccurred"].map((name) => [name, (_filter: unknown, listener: Listener) => { listeners[name] = listener; }]));
  try {
    process.env.ZOTIGOD_URL = getDaemonConfig().baseUrl;
    process.env.ZOTIGOD_AUTH_TOKEN_FILE = path.join(directory, "token");
    fs.writeFileSync(process.env.ZOTIGOD_AUTH_TOKEN_FILE, "image-secret");
    configureDaemonImageAuth({ webRequest } as unknown as Session);
    const image = { id: 1, url: getDaemonConfig().baseUrl + "/sessions/one/images/two", requestHeaders: {} };
    function invoke(name: string, details: Details): Result {
      let result: Result = {};
      listeners[name](details, (value) => { result = value; }); return result;
    }
    assert.deepEqual(invoke("onBeforeRequest", image), {});
    assert.equal(invoke("onBeforeSendHeaders", image).requestHeaders?.authorization, "Bearer image-secret");
    assert.equal(invoke("onBeforeRequest", { ...image, url: "https://foreign.example/image" }).cancel, true);
    assert.equal(invoke("onBeforeRequest", { ...image, url: getDaemonConfig().baseUrl + "/projects" }).cancel, true);
    invoke("onErrorOccurred", image);
    const other = { ...image, url: "https://foreign.example/image" };
    assert.deepEqual(invoke("onBeforeRequest", other), {});
    assert.deepEqual(invoke("onBeforeSendHeaders", other), {});
  } finally {
    if (previousFile === undefined) delete process.env.ZOTIGOD_AUTH_TOKEN_FILE; else process.env.ZOTIGOD_AUTH_TOKEN_FILE = previousFile;
    if (previousUrl === undefined) delete process.env.ZOTIGOD_URL; else process.env.ZOTIGOD_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test("image requests retain their host credential and reject cross-host redirects", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-image-hosts-"));
  type Details = { id: number; url: string; requestHeaders: Record<string, string> };
  type Result = { cancel?: boolean; requestHeaders?: Record<string, string> };
  const listeners: Record<string, (details: Details, callback: (result: Result) => void) => void> = {};
  const webRequest = Object.fromEntries(["onBeforeRequest", "onBeforeSendHeaders", "onCompleted", "onErrorOccurred"].map((name) => [name, (_filter: unknown, listener: typeof listeners[string]) => { listeners[name] = listener; }]));
  function invoke(name: string, details: Details): Result {
    let result: Result = {};
    listeners[name](details, (value) => { result = value; });
    return result;
  }
  try {
    initializeHosts(directory);
    const first = saveHost({ name: "First", baseUrl: "http://127.0.0.1:19321", token: "first-secret" });
    const second = saveHost({ name: "Second", baseUrl: first.baseUrl, token: "second-secret" });
    configureDaemonImageAuth({ webRequest } as unknown as Session);
    const a = { id: 1, url: `${first.baseUrl}/sessions/same/images/same?zotigoHost=${first.id}`, requestHeaders: {} };
    const b = { ...a, id: 2, url: `${second.baseUrl}/sessions/same/images/same?zotigoHost=${second.id}` };
    assert.deepEqual(invoke("onBeforeRequest", a), {});
    assert.deepEqual(invoke("onBeforeRequest", b), {});
    deleteHost(first.id);
    assert.equal(invoke("onBeforeSendHeaders", a).requestHeaders?.authorization, "Bearer first-secret");
    assert.equal(invoke("onBeforeSendHeaders", b).requestHeaders?.authorization, "Bearer second-secret");
    assert.equal(invoke("onBeforeRequest", { ...a, url: b.url }).cancel, true);
    invoke("onCompleted", a);
    assert.equal(invoke("onBeforeRequest", { ...a, id: 3 }).cancel, true);
    assert.equal(invoke("onBeforeRequest", { ...b, url: `https://foreign.example/sessions/same/images/same?zotigoHost=${second.id}` }).cancel, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
