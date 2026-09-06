import { createClientApi } from "../../shared/clientApi";
import { parseMarkdownLink } from "../../shared/markdownLinks";
import type { SessionEventEnvelope, SourceCandidate } from "../../shared/clientTypes";
import type { CatalogSelection } from "../../shared/catalogSelection";
import { createBrowserSelection } from "./selection";

export class WebRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function webRequest<T>(path: string, body?: unknown, hostId?: string): Promise<T> {
  const response = await fetch(path, body === undefined ? { headers: hostId ? { "X-Zotigo-Host": hostId } : {} } : {
    method: "POST", headers: { ...(hostId ? { "X-Zotigo-Host": hostId } : {}), "Content-Type": "application/json", "X-Zotigo-Request": "1" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("zotigo:unauthorized"));
    throw new WebRequestError(result.error ?? "Web request failed.", response.status);
  }
  return result as T;
}

export function createWebClient(chooseSources: () => Promise<SourceCandidate[]>) {
  let activeHost = "local";
  const makeSelection = (host: string) => createBrowserSelection({
    getItem: (key) => sessionStorage.getItem(host === "local" ? key : `${host}:${key}`),
    setItem: (key, value) => sessionStorage.setItem(host === "local" ? key : `${host}:${key}`, value),
  });
  let selection = makeSelection(activeHost);
  let source: EventSource | null = null;
  const listeners = new Set<(event: SessionEventEnvelope) => void>();
  const close = () => { source?.close(); source = null; };
  const api = createClientApi({
    invoke: async <T>(channel: string, ...args: unknown[]): Promise<T> => {
      const request = selection.begin(channel);
      try {
        const result = await webRequest<({ ok: true; value: T } | { ok: false; error: string }) & { selection: CatalogSelection }>("/api/rpc", { channel, args, selection: request.selection }, activeHost);
        if (!result.ok) throw new Error(result.error);
        request.accept(result.selection);
        return request.project(result.value);
      } catch (error) {
        request.cancel();
        throw error;
      }
    },
    onSessionEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  const activate = api.setActiveHost;
  api.setActiveHost = async (id) => { await activate(id); close(); activeHost = id; selection = makeSelection(id); };
  api.subscribeSessionEvents = async (id, after) => {
    close();
    const query = new URLSearchParams({ session: id, zotigoHost: activeHost });
    if (after !== undefined) query.set("after", String(after));
    source = new EventSource(`/api/events?${query}`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as SessionEventEnvelope;
      for (const listener of listeners) listener(event);
    };
    source.onerror = () => {
      for (const listener of listeners) listener({ session_id: id, status: "reconnecting" });
      // EventSource hides HTTP status. Check the session so an expired/revoked
      // cookie returns to login rather than retrying an unauthorized stream forever.
      void webRequest("/api/session").catch(() => {});
    };
  };
  api.unsubscribeSessionEvents = async () => { close(); };
  api.chooseSourceFolders = chooseSources;
  api.revealPath = async () => { throw new Error("Opening a server folder in Finder requires Desktop."); };
  const openLink = api.openMarkdownLink;
  api.openMarkdownLink = async (input) => {
    const link = parseMarkdownLink(input.href);
    if (link.kind === "external") {
      window.open(link.url, "_blank", "noopener,noreferrer");
      return { kind: "external" };
    }
    return openLink(input);
  };
  api.downloadImage = async (value) => {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !/^\/sessions\/[^/]+\/images\/[^/]+$/.test(url.pathname)) {
      throw new Error("Only session images can be downloaded.");
    }
    url.searchParams.set("download", "1");
    const anchor = document.createElement("a");
    anchor.href = url.toString(); anchor.download = "";
    anchor.click();
  };
  return { api, dispose: close };
}
