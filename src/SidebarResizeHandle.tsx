import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { useEffect, useRef, useState, type RefObject } from "react";

const minWidth = 240;
const defaultWidth = 320;
const maxWidth = 480;
const storageKey = "zotigo:sidebar-width";

// Read before the frame's first render so CSS cannot animate from the default.
export function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(storageKey);
    const value = raw === null ? NaN : Number(raw);
    if (Number.isFinite(value)) return Math.max(minWidth, Math.min(maxWidth, value));
  } catch { /* Storage is optional. */ }
  return defaultWidth;
}

export function SidebarResizeHandle({ frameRef, width, onWidth, onResizing }: {
  frameRef: RefObject<HTMLElement | null>;
  width: number;
  onWidth: (width: number) => void;
  onResizing: (active: boolean) => void;
}) {
  useLocale();
  const [limit, setLimit] = useState(maxWidth);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const latestWidth = useRef(width);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setLimit(Math.max(minWidth, Math.min(maxWidth, frame.clientWidth - 420)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef]);
  function update(value: number) {
    const next = Math.round(Math.max(minWidth, Math.min(limit, value)));
    latestWidth.current = next;
    onWidth(next);
  }
  function save() {
    try { localStorage.setItem(storageKey, String(latestWidth.current)); } catch { /* Storage is optional. */ }
  }
  function finish() {
    if (!drag.current) return;
    drag.current = null;
    onResizing(false);
    save();
  }
  return <div
    className="sidebar-resize-handle"
    role="separator"
    aria-label={t("sidebarResizeHandle.sidebarWidth")}
    aria-orientation="vertical"
    aria-valuemin={minWidth}
    aria-valuemax={limit}
    aria-valuenow={Math.min(width, limit)}
    tabIndex={0}
    title={t("sidebarResizeHandle.dragToResizeSidebarDoubleClickToReset")}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, width: Math.min(width, limit) };
      onResizing(true);
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start?.id === event.pointerId) update(start.width + event.clientX - start.x);
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      finish();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={finish}
    onLostPointerCapture={finish}
    onDoubleClick={() => { update(defaultWidth); save(); }}
    onKeyDown={event => {
      let next: number;
      switch (event.key) {
        case "ArrowLeft": next = Math.min(width, limit) - 16; break;
        case "ArrowRight": next = Math.min(width, limit) + 16; break;
        case "Home": next = minWidth; break;
        case "End": next = limit; break;
        default: return;
      }
      event.preventDefault();
      update(next);
      save();
    }}
  />;
}
