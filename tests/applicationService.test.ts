import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApplicationService, type NativeServices } from "../backend/applicationService";
import { getDaemonConfig, setDaemonBaseUrl } from "../backend/zotigod";
import { createClientApi } from "../shared/clientApi";

function platform(overrides: Partial<NativeServices> = {}): NativeServices {
  const unexpected = async () => { throw new Error("Unexpected native operation"); };
  return { chooseSourceFolders: unexpected, openPath: unexpected, openExternal: unexpected, downloadImage: unexpected, ...overrides };
}

test("optional client arguments survive JSON transport without becoming explicit null", async () => {
  const calls: unknown[] = [];
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      calls.push(JSON.parse(JSON.stringify({ channel, args })));
      return undefined as T;
    },
    onSessionEvent: () => () => {},
  });
  await api.getProfiles();
  await api.listSkills("session");
  await api.listSessionItems("session");
  await api.selectConversation(null);
  await api.listSkills("session", false);
  assert.deepEqual(calls, [
    { channel: "daemon:get-profiles", args: [] },
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
    onSessionEvent: () => () => {},
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
  const sources = [{ selectedPath: "/tmp/project", canonicalPath: "/tmp/project", name: "project", kind: "folder" as const }];
  const service = createApplicationService(platform({ chooseSourceFolders: async () => sources }), () => {});
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]) => {
      const result = await service.invoke(channel, args);
      if (!result.ok) throw new Error(result.error);
      return result.value as T;
    },
    onSessionEvent: () => () => {},
  });
  assert.deepEqual(await api.chooseSourceFolders(), sources);
  assert.deepEqual(await api.openMarkdownLink({ href: "#heading", basePath: null, baseKind: "directory" }), { kind: "anchor", anchor: "heading" });
  assert.deepEqual(await service.invoke("__proto__", []), { ok: false, error: "Unknown application operation" });
  service.dispose();
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
