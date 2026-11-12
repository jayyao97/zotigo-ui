import type { FileEventEnvelope } from "../shared/fileEvents";
import { contextBridge, ipcRenderer } from "electron";
import { createClientApi } from "../shared/clientApi";
import type { SessionEventEnvelope } from "../shared/clientTypes";

import { DiagnosticBuffer } from "./diagnosticBuffer";
import type { DiagnosticStatus } from "../shared/diagnostics";

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

let activeHost = "local";
const api = createClientApi({
  invoke: async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const result = await ipcRenderer.invoke(channel, { hostId: activeHost, args }) as IpcResult<T>;
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  onFileEvent: (listener) => {
    const host = activeHost;
    const handler = (_event: Electron.IpcRendererEvent, event: FileEventEnvelope & { hostId?: string }) => { if (event.hostId === host) listener(event); };
    ipcRenderer.on("files:event", handler);
    return () => ipcRenderer.removeListener("files:event", handler);
  },
  onSessionEvent: (listener) => {
    const host = activeHost;
    const handler = (_event: Electron.IpcRendererEvent, event: SessionEventEnvelope & { hostId?: string }) => { if (event.hostId === host) listener(event); };
    ipcRenderer.on("sessions:event", handler);
    return () => ipcRenderer.removeListener("sessions:event", handler);
  },
});

const diagnosticBuffer = new DiagnosticBuffer((host, samples) => ipcRenderer.invoke("diagnostics:control", "append", { host, samples }));
setInterval(() => { if (!diagnosticBuffer.flushing) void diagnosticBuffer.flush(); }, 2000);
window.addEventListener("pagehide", () => { void diagnosticBuffer.flush(); });
let diagnosticControl = false;
ipcRenderer.on("diagnostics:flush", (_event, nonce: string) => {
  diagnosticControl = true; diagnosticBuffer.enabled = false;
  void diagnosticBuffer.flush().finally(() => ipcRenderer.send("diagnostics:flushed", nonce));
});
const updateDiagnostics = (status: DiagnosticStatus) => {
  diagnosticBuffer.enabled = status.enabled && !diagnosticControl;
  return { ...status, dropped: status.dropped + diagnosticBuffer.dropped };
};
api.diagnostics = {
  status: async () => updateDiagnostics(await ipcRenderer.invoke("diagnostics:control", "status")),
  enable: async enabled => {
    diagnosticControl = true; diagnosticBuffer.enabled = false;
    try { await diagnosticBuffer.flush(); return await ipcRenderer.invoke("diagnostics:control", "enable", enabled); }
    finally { diagnosticControl = false; await api.diagnostics!.status(); }
  },
  context: () => activeHost,
  append: async (samples, context) => { diagnosticBuffer.push(context ?? activeHost, samples); },
  export: async range => { await diagnosticBuffer.flush(); return ipcRenderer.invoke("diagnostics:control", "export", range); },
  clear: async () => {
    diagnosticControl = true; diagnosticBuffer.enabled = false;
    try { await diagnosticBuffer.flush(); await ipcRenderer.invoke("diagnostics:control", "clear"); diagnosticBuffer.dropped = 0; }
    finally { diagnosticControl = false; await api.diagnostics!.status(); }
  },
  record: () => ipcRenderer.invoke("diagnostics:control", "record"),
};
void api.diagnostics.status().catch(() => {});

const activate = api.setActiveHost;
api.closeWindow = () => ipcRenderer.invoke("window:close");
ipcRenderer.on("window:close-request", () => window.dispatchEvent(new Event("zotigo:close-request")));
api.setActiveHost = async (id) => { await activate(id); activeHost = id; };
contextBridge.exposeInMainWorld("zotigo", api);
