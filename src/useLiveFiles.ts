import { useEffect, useRef, useState, type RefObject } from "react";
import type { ClientApi } from "../shared/clientTypes";
import type { OpenFileState } from "./openFileState";

export function useLiveFiles(client: ClientApi, files: Record<string, OpenFileState>, filesRef: RefObject<Record<string, OpenFileState>>,
  setFiles: (files: Record<string, OpenFileState>) => void, activePath: string | undefined, switching: RefObject<boolean>) {
  const [notice, setNotice] = useState("");
  const stale = useRef(new Set<string>());
  const reading = useRef(new Set<string>());
  const queuedReloads = useRef(new Map<string, OpenFileState>());
  const alive = useRef(true);
  const active = useRef(activePath); active.current = activePath;
  const changed = (path: string, value: OpenFileState) => {
    const next = { ...filesRef.current, [path]: value }; filesRef.current = next; setFiles(next);
  };
  const refresh = async (path: string, discard = false) => {
    const before = filesRef.current[path];
    if (!before || switching.current || before.saveStatus === "saving") return;
    if (reading.current.has(path)) {
      if (discard) queuedReloads.current.set(path, before);
      return;
    }
    reading.current.add(path); stale.current.delete(path);
    try {
      const opened = await client.openFile(path, before.sessionId);
      const current = filesRef.current[path];
      if (!alive.current || switching.current || !current) return;
      // Edits and saves can finish while the network read is in flight.
      if (current.file !== before.file || current.saveStatus === "saving") { stale.current.add(path); return; }
      if (current.kind === "text" && current.draft !== current.file.content && !(discard && current.draft === beforeDraft(before))) {
        const conflict = opened.kind !== "text" || opened.file.content !== current.file.content;
        changed(path, { ...current, diskChanged: conflict, refreshError: undefined });
        return;
      }
      if (opened.kind !== current.kind) {
        changed(path, { ...current, refreshError: "File type changed. Close and reopen the file to view it." }); return;
      }
      changed(path, opened.kind === "text" && current.kind === "text"
        ? { ...current, file: opened.file, draft: opened.file.content, saveStatus: "clean", saveError: undefined, diskChanged: false, refreshError: undefined }
        : { ...current, file: opened.file, diskChanged: false, refreshError: undefined } as OpenFileState);
    } catch (error) {
      const current = filesRef.current[path];
      if (alive.current && !switching.current && current && current.file === before.file) {
        changed(path, { ...current,
          refreshError: `Could not refresh file: ${error instanceof Error ? error.message : String(error)}` });
      }
    } finally {
      reading.current.delete(path);
      const queued = queuedReloads.current.get(path);
      queuedReloads.current.delete(path);
      const current = filesRef.current[path];
      if (queued && current && alive.current && !switching.current && current.file === queued.file && beforeDraft(current) === beforeDraft(queued)) {
        void refreshRef.current(path, true);
      } else if (alive.current && !switching.current && stale.current.has(path) && active.current === path && filesRef.current[path]?.saveStatus !== "saving") void refresh(path);
    }
  };
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const subscriptionKey = JSON.stringify(Object.values(files).map((file) => ({ path: file.file.path, sessionId: file.sessionId })).sort((a, b) => a.path.localeCompare(b.path)));
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const watched = JSON.parse(subscriptionKey) as { path: string; sessionId?: string }[];
    if (!watched.length) { setNotice(""); return; }
    const id = crypto.randomUUID();
    const invalidate = (paths: string[]) => {
      for (const path of paths) if (filesRef.current[path]) stale.current.add(path);
      if (!document.hidden && active.current && stale.current.has(active.current)) void refreshRef.current(active.current);
    };
    const unsubscribe = client.onFileEvent((event) => {
      if (event.subscriptionId !== id) return;
      if (event.type === "changed") invalidate(event.paths);
      if (event.type === "ready") {
        setNotice(event.paths.length ? "Some files cannot update automatically. Use Refresh to reload them." : watched.length > 64 ? "Live updates support up to 64 open files. Use Refresh for additional files." : "");
        invalidate(watched.map((file) => file.path));
      }
      if (event.type === "reconnecting") setNotice("Live updates reconnecting. You can still refresh manually.");
      if (event.type === "unavailable") setNotice("Live updates unavailable. Use Refresh to reload files.");
    });
    if (watched.length > 64) setNotice("Live updates support up to 64 open files. Use Refresh for additional files.");
    void client.subscribeFileEvents(id, watched.slice(0, 64)).catch(() => { if (alive.current) setNotice("Live updates unavailable. Use Refresh to reload files."); });
    const foreground = () => { if (!document.hidden) invalidate(watched.map((file) => file.path)); };
    window.addEventListener("focus", foreground); document.addEventListener("visibilitychange", foreground);
    return () => {
      unsubscribe(); void client.unsubscribeFileEvents().catch(() => {});
      window.removeEventListener("focus", foreground); document.removeEventListener("visibilitychange", foreground);
    };
  }, [client, subscriptionKey]);
  useEffect(() => {
    if (activePath && stale.current.has(activePath) && !document.hidden) void refreshRef.current(activePath);
  }, [activePath, files]);
  return { refresh, notice };
}

function beforeDraft(file: OpenFileState) { return file.kind === "text" ? file.draft : undefined; }
