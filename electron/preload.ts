import { contextBridge, ipcRenderer } from "electron";
import { createClientApi } from "../shared/clientApi";
import type { SessionEventEnvelope } from "../shared/clientTypes";

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

const api = createClientApi({
  invoke: async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  onSessionEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: SessionEventEnvelope) => listener(event);
    ipcRenderer.on("sessions:event", handler);
    return () => ipcRenderer.removeListener("sessions:event", handler);
  },
});

contextBridge.exposeInMainWorld("zotigo", api);
