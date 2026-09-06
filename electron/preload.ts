import { contextBridge, ipcRenderer } from "electron";
import { createClientApi } from "../shared/clientApi";
import type { SessionEventEnvelope } from "../shared/clientTypes";

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

let activeHost = "local";
const api = createClientApi({
  invoke: async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const result = await ipcRenderer.invoke(channel, { hostId: activeHost, args }) as IpcResult<T>;
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  onSessionEvent: (listener) => {
    const host = activeHost;
    const handler = (_event: Electron.IpcRendererEvent, event: SessionEventEnvelope & { hostId?: string }) => { if (event.hostId === host) listener(event); };
    ipcRenderer.on("sessions:event", handler);
    return () => ipcRenderer.removeListener("sessions:event", handler);
  },
});

const activate = api.setActiveHost;
api.setActiveHost = async (id) => { await activate(id); activeHost = id; };
contextBridge.exposeInMainWorld("zotigo", api);
