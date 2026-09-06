import type { Session } from "electron";
import { daemonHeaders } from "../backend/daemonHttp";
import { imageDownloadUrl } from "../backend/imageDownload";
import { getDaemonConfig } from "../backend/zotigod";

// Chromium loads previews and native downloads outside the Node API client.
export function configureDaemonImageAuth(session: Session): void {
  const requests = new Set<number>();
  const filter = { urls: ["http://*/*", "https://*/*"] };
  session.webRequest.onBeforeRequest(filter, (details, callback) => {
    let image = false;
    try { imageDownloadUrl(details.url, getDaemonConfig().baseUrl); image = true; } catch { /* Not a daemon image. */ }
    if (requests.has(details.id) && !image) { callback({ cancel: true }); return; }
    if (image) requests.add(details.id);
    callback({});
  });
  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (!requests.has(details.id)) { callback({}); return; }
    try {
      const headers = daemonHeaders(details.url, details.requestHeaders);
      const requestHeaders: Record<string, string> = {};
      headers.forEach((value, name) => { requestHeaders[name] = value; });
      callback({ requestHeaders });
    } catch { callback({ cancel: true }); }
  });
  session.webRequest.onCompleted(filter, (details) => { requests.delete(details.id); });
  session.webRequest.onErrorOccurred(filter, (details) => { requests.delete(details.id); });
}
