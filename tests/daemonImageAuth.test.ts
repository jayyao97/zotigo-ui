import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Session } from "electron";
import { configureDaemonImageAuth } from "../electron/daemonImageAuth";
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
