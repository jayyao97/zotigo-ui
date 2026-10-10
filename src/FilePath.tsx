import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fileBreadcrumbs } from "../shared/fileBreadcrumbs";

export function FilePath({ path, workspaceRoot }: { path: string; workspaceRoot?: string }) {
  const segments = fileBreadcrumbs(path, workspaceRoot);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    setWidth(node.clientWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setExpanded(false);
  }, [path]);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setExpanded(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [expanded]);
  // Measure the same font used by the path; fold whole directories, never each segment.
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (canvas && container.current) canvas.font = getComputedStyle(container.current).font;
  const measure = (text: string) => canvas?.measureText(text).width ?? text.length * 7;
  const filename = segments.at(-1) ?? path;
  const shortName = (value: string, budget: number) => {
    if (measure(value) <= budget) return value;
    let keep = Math.max(2, value.length - 1);
    while (keep > 2) {
      const end = Math.min(Math.max(value.length - value.lastIndexOf("."), 8), Math.floor(keep / 2));
      const shortened = `${value.slice(0, keep - end)}…${value.slice(-end)}`;
      if (measure(shortened) <= budget) return shortened;
      keep--;
    }
    return `${value.slice(0, 1)}…${value.slice(-1)}`;
  };
  let shown = [...segments];
  const total = (parts: string[]) => parts.reduce((sum, value) => sum + measure(value), 0) + Math.max(0, parts.length - 1) * 22;
  while (shown.length > 3 && total(shown) > width) {
    if (shown[1] === "…") shown.splice(2, 1);
    else shown.splice(1, 1, "…");
  }
  if (shown.length === 1) shown = [shortName(filename, Math.max(40, width))];
  if (total(shown) > width && shown.length > 1) {
    const root = shortName(segments[0], Math.min(120, width * .25));
    const prefix = segments.length > 2 ? [root, "…"] : [root];
    shown = [...prefix, shortName(filename, Math.max(40, width - total(prefix) - 22))];
  }
  return <div ref={container} className="file-path">
    <button type="button" className="file-path-toggle" title={path} aria-label={`Show full path: ${path}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span className="file-path-desktop">{shown.map((part, index) => <span key={index}>{index > 0 && <ChevronRight size={14} />}<span>{part}</span></span>)}</span>
      <span className="file-path-mobile">{shortName(filename, Math.max(60, width))}</span>
    </button>
    {expanded && <div className="file-path-expanded">{path}</div>}
  </div>;
}

export function MobileFileNavigation({ path, onBack, onClose }: { path: string; onBack: () => void; onClose: () => void }) {
  return <div className="mobile-file-navigation">
    <button type="button" aria-label="Back to containing folder" onClick={onBack}><ArrowLeft size={20} /></button>
    <FilePath path={path} />
    <button type="button" aria-label="Close files and return to conversation" onClick={onClose}><X size={20} /></button>
  </div>;
}
