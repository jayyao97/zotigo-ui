import { useCallback, useEffect, useState } from "react";

export type ChannelActivityMode = "pinned" | "all" | "none";
export function useActivityChannelMode(host: string): [ChannelActivityMode, (mode: ChannelActivityMode) => void] {
  const key = `zotigo:activity-channels:${host}`;
  const read = () : ChannelActivityMode => {
    try { const value = localStorage.getItem(key); return value === "all" || value === "none" ? value : "pinned"; } catch { return "pinned"; }
  };
  const [state, setState] = useState<{key: string; mode: ChannelActivityMode}>(() => ({key, mode: read()}));
  useEffect(() => { setState({key, mode: read()}); }, [key]);
  const save = useCallback((mode: ChannelActivityMode) => {
    setState({key, mode});
    try { localStorage.setItem(key, mode); } catch { /* Keep the current window preference. */ }
  }, [key]);
  return [state.key === key ? state.mode : read(), save];
}
