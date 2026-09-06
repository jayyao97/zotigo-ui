import type { Session } from "electron";
import { daemonHeaders } from "../backend/daemonHttp";
import { imageDownloadUrl } from "../backend/imageDownload";
import { resolveHost, withConnection, type Connection } from "../backend/hosts";

// Chromium loads previews and native downloads outside the Node API client.
export function configureDaemonImageAuth(session: Session): void {
  const requests = new Map<number, Connection>();
  const filter = { urls: ["http://*/*", "https://*/*"] };
  session.webRequest.onBeforeRequest(filter, (details, callback) => {
    let image = false;
    let host = requests.get(details.id);
    try {
      const id = new URL(details.url).searchParams.get("zotigoHost") ?? "local";
      host ??= resolveHost(id);
      if (id !== host.id) throw new Error("Image host changed.");
      imageDownloadUrl(details.url, host.baseUrl); image = true;
    } catch { /* Not an image from this host. */ }
    if (requests.has(details.id) && !image) { callback({ cancel: true }); return; }
    if (image && host) requests.set(details.id, host);
    else if (new URL(details.url).searchParams.has("zotigoHost")) { callback({ cancel: true }); return; }
    callback({});
  });
  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (!requests.has(details.id)) { callback({}); return; }
    try {
      const headers = withConnection(requests.get(details.id)!, () => daemonHeaders(details.url, details.requestHeaders));
      const requestHeaders: Record<string, string> = {};
      headers.forEach((value, name) => { requestHeaders[name] = value; });
      callback({ requestHeaders });
    } catch { callback({ cancel: true }); }
  });
  session.webRequest.onCompleted(filter, (details) => { requests.delete(details.id); });
  session.webRequest.onErrorOccurred(filter, (details) => { requests.delete(details.id); });
}
