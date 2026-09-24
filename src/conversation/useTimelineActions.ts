import { useCallback, useLayoutEffect, useRef } from "react";

// Keep timeline actions stable during typing while using the latest committed
// selection and host state when the user clicks an action.
export function useTimelineActions(actions: {
  onFork: (turnId: string) => void;
  onOpenForkSource?: (sessionId: string) => void;
}) {
  const current = useRef(actions);
  useLayoutEffect(() => { current.current = actions; });
  const onFork = useCallback((turnId: string) => current.current.onFork(turnId), []);
  const onOpenForkSource = useCallback((sessionId: string) => current.current.onOpenForkSource?.(sessionId), []);
  return { onFork, onOpenForkSource: actions.onOpenForkSource ? onOpenForkSource : undefined };
}
