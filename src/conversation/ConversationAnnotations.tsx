import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { MessageSquareQuote, Pencil, Trash2, X } from "lucide-react";
import type { ConversationReference } from "../../shared/conversationReferences";
import { annotationRange } from "./annotationRange";

type Props = {
  root: RefObject<HTMLDivElement | null>;
  references: ConversationReference[];
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onChange: (references: ConversationReference[]) => void;
};

export function avoidAnnotationMarkers(position: { left: number; top: number }, size: { width: number; height: number }, markers: readonly DOMRect[], minTop: number) {
  let top = position.top;
  // Process lower markers first so raising the popup can also avoid a marker
  // immediately above it. Non-overlapping markers never move the popup.
  for (const marker of [...markers].sort((a, b) => b.top - a.top)) {
    if (position.left < marker.right && position.left + size.width > marker.left && top < marker.bottom && top + size.height > marker.top) {
      top = Math.max(minTop, marker.top - size.height - 8);
    }
  }
  return { ...position, top };
}

// The same positioning rules serve selection actions, comments and translations.
export function useAnchoredPopup(popup: RefObject<HTMLDivElement | null>, rect: DOMRect | null, avoidMarkers = false) {
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!rect || !popup.current) return;
    const update = () => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const size = popup.current!.getBoundingClientRect();
      const above = rect.top - size.height - 10;
      const next = {
        left: Math.max(left + 8, Math.min(rect.left, left + width - size.width - 8)),
        top: Math.max(top + 8, Math.min(above >= top + 8 ? above : rect.bottom + 10, top + height - size.height - 8)),
      };
      const markers = avoidMarkers ? Array.from(document.querySelectorAll<HTMLElement>('.annotation-marker'), marker => marker.getBoundingClientRect()) : [];
      setPosition(avoidAnnotationMarkers(next, size, markers, top + 8));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(popup.current);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); };
  }, [popup, rect, avoidMarkers]);
  return position;
}

export function ConversationAnnotations({ root, references, editingId, onEdit, onChange }: Props) {
  const [anchors, setAnchors] = useState<{ id: string; rect: DOMRect; marker: DOMRect }[]>([]);
  const popup = useRef<HTMLDivElement>(null);
  const originalComment = useRef("");
  const current = references.find(value => value.id === editingId);
  const anchor = anchors.find(value => value.id === editingId);
  const position = useAnchoredPopup(popup, anchor?.rect ?? null, true);
  const latest = useRef({ onEdit }); latest.current = { onEdit };
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const update = () => {
      const bounds = container.getBoundingClientRect();
      const ranges: Range[] = [];
      const next: typeof anchors = [];
      for (const reference of references) {
        const message = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find(node => node.dataset.messageId === reference.messageId);
        const range = message && annotationRange(message, reference);
        if (!range) continue;
        ranges.push(range);
        const visible = Array.from(range.getClientRects()).filter(rect => rect.bottom > bounds.top && rect.top < bounds.bottom);
        if (container.offsetParent !== null && visible.length) next.push({ id: reference.id, rect: visible[0], marker: visible[visible.length - 1] });
      }
      if (typeof Highlight !== "undefined" && CSS.highlights) CSS.highlights.set("conversation-annotations", new Highlight(...ranges));
      setAnchors(next);
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { childList: true, characterData: true, subtree: true });
    const resize = new ResizeObserver(schedule); resize.observe(container);
    container.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => { cancelAnimationFrame(frame); mutations.disconnect(); resize.disconnect(); container.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.delete("conversation-annotations"); };
  }, [references, root]);
  useEffect(() => {
    if (!editingId) return;
    const reference = references.find(value => value.id === editingId);
    originalComment.current = reference?.comment ?? "";
    const container = root.current;
    const reveal = () => {
      const message = Array.from(container?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find(node => node.dataset.messageId === reference?.messageId);
      const expand = message?.querySelector<HTMLButtonElement>('.user-message-toggle[aria-expanded="false"]');
      if (expand) { expand.click(); return false; }
      const range = message && reference && annotationRange(message, reference);
      if (!range || !container) return false;
      const rect = range.getBoundingClientRect(), bounds = container.getBoundingClientRect();
      if (rect.top < bounds.top + 120 || rect.bottom > bounds.bottom - 40) container.scrollTop += rect.top - bounds.top - container.clientHeight / 3;
      return true;
    };
    const sourceObserver = new MutationObserver(() => { if (reveal()) sourceObserver.disconnect(); });
    if (!reveal() && container) sourceObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (!popup.current?.contains(event.target as Node) && !(event.target as Element)?.closest?.('[data-annotation-control], .annotation-editor')) latest.current.onEdit(null);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") latest.current.onEdit(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", key);
    return () => { sourceObserver.disconnect(); document.removeEventListener("pointerdown", dismiss); document.removeEventListener("focusin", dismiss); document.removeEventListener("keydown", key); };
    // Capture the comment once per editing session; typing must not reset Cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, root]);
  return createPortal(<>
    {anchors.map(({ id, marker }) => <button type="button" data-annotation-control className="annotation-marker" key={id} aria-label={`Edit annotation ${references.findIndex(value => value.id === id) + 1}`} style={{ left: Math.min(marker.right, (root.current?.getBoundingClientRect().right ?? window.innerWidth) - 32), top: marker.top - 20 }} onClick={() => onEdit(id)}>{references.findIndex(value => value.id === id) + 1}</button>)}
    {current && anchor && <div key={current.id} ref={popup} className="annotation-editor" role="dialog" aria-label="Edit annotation" style={position}>
      <textarea autoFocus aria-label="Annotation comment" placeholder="Add an optional comment…" value={current.comment} onChange={event => onChange(references.map(value => value.id === current.id ? { ...value, comment: event.target.value } : value))} />
      <footer><button type="button" aria-label="Delete annotation" onClick={() => { onChange(references.filter(value => value.id !== current.id)); onEdit(null); }}><Trash2 size={16} /></button><span /><button type="button" onClick={() => { onChange(references.map(value => value.id === current.id ? { ...value, comment: originalComment.current } : value)); onEdit(null); }}>Cancel</button><button type="button" onClick={() => onEdit(null)}>Save</button></footer>
    </div>}
  </>, document.body);
}

export function ComposerReferences({ references, onChange, onEdit }: { references: ConversationReference[]; onChange: (value: ConversationReference[]) => void; onEdit: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  if (!references.length) return null;
  return <div ref={container} className="composer-annotations" onMouseEnter={() => { if (window.matchMedia("(hover: hover)").matches) setOpen(true); }} onMouseLeave={() => setOpen(false)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="annotation-chip"><button type="button" aria-expanded={open} onClick={() => setOpen(value => window.matchMedia("(hover: hover)").matches || !value)} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}><MessageSquareQuote size={16} />{references.length} {references.length === 1 ? "annotation" : "annotations"}</button><button type="button" aria-label="Remove all annotations" onClick={() => onChange([])}><X size={14} /></button></div>
    {open && <div className="annotation-preview" aria-label="Annotations">{references.map((reference, index) => <div className="annotation-preview-item" key={reference.id}>
      <span>{index + 1}.</span><div><small>Selected text</small><blockquote>{reference.text}</blockquote>{reference.comment && <><small>Your comment</small><p>{reference.comment}</p></>}</div>
      <button type="button" aria-label={`Edit annotation ${index + 1}`} onClick={() => { setOpen(false); onEdit(reference.id); }}><Pencil size={16} /></button><button type="button" aria-label={`Delete annotation ${index + 1}`} onClick={() => onChange(references.filter(value => value.id !== reference.id))}><Trash2 size={16} /></button>
    </div>)}</div>}
  </div>;
}
