import { useState } from "react";
export type SendMode = "steering" | "queue";
export function alternateSendMode(mode: SendMode): SendMode { return mode === "steering" ? "queue" : "steering"; }
export function useDefaultSendMode(host: string): [SendMode, (mode: SendMode) => void] {
  const [values, setValues] = useState<Record<string, SendMode>>({});
  const key = `zotigo.send-mode:${host}`;
  let saved: SendMode = "steering";
  try { if (localStorage.getItem(key) === "queue") saved = "queue"; } catch { /* In-memory fallback. */ }
  return [values[host] ?? saved, mode => {
    setValues(previous => ({ ...previous, [host]: mode }));
    try { localStorage.setItem(key, mode); } catch { /* In-memory fallback. */ }
  }];
}
