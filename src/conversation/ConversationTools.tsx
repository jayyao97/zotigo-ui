import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Languages, MessageSquareQuote, X } from "lucide-react";
import type { ConversationReference } from "../../shared/conversationReferences";
import { ConversationAnnotations, useAnchoredPopup } from "./ConversationAnnotations";
export { ComposerReferences } from "./ConversationAnnotations";
import { selectionOffset } from "./annotationRange";
import { selectedMessageRange } from "./selectionText";
import { ConversationFind } from "./ConversationFind";
import type { DisplayItem, SessionSearchHit, SessionSearchResponse } from "../../shared/zotigod";

type Props = {
  language: "zh-CN" | "en";
  references: ConversationReference[];
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onReferencesChange: (references: ConversationReference[]) => void;
  root: RefObject<HTMLDivElement | null>;
  onReference: (reference: ConversationReference) => void;
  translate: (text: string, language: "zh-CN" | "en") => Promise<string>;
  items: DisplayItem[];
  search: (query: string) => Promise<SessionSearchResponse>;
  showHit: (hit: SessionSearchHit, signal: AbortSignal) => Promise<void>;
  onCloseSearch: () => void;
  onSearch: () => void;
};
type SelectionText = { text: string; messageId: string; startOffset: number; rect: DOMRect };

export function ConversationTools({ root, onReference, translate, items, search, showHit, onCloseSearch, onSearch, language, references, editingId, onEdit, onReferencesChange }: Props) {
  const [selection, setSelection] = useState<SelectionText | null>(null);
  const [translation, setTranslation] = useState<{ text: string; pending: boolean; error?: boolean } | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const position = useAnchoredPopup(popup, selection?.rect ?? null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (popup.current?.contains(document.activeElement)) return;
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
        if (popup.current?.contains(selected.getRangeAt(0).startContainer)) return;
        const match = root.current && selectedMessageRange(selected.getRangeAt(0), root.current);
        if (!match) { setSelection(null); return; }
        const { message, range } = match;
        const rawText = range.toString();
        const text = rawText.trim();
        if (!text) return;
        const rect = range.getBoundingClientRect();
        request.current++; setTranslation(null);
        setSelection({ text, messageId: message.dataset.messageId!, rect, startOffset: selectionOffset(message, range) + rawText.indexOf(text) });
      }, 150);
    };
    const dismiss = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node)) { request.current++; setTranslation(null); setSelection(null); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { request.current++; setSelection(null); setTranslation(null); } };
    const scrolled = () => { request.current++; setSelection(null); setTranslation(null); };
    const element = root.current;
    element?.addEventListener("scroll", scrolled, { passive: true });
    window.addEventListener("resize", scrolled);
    document.addEventListener("selectionchange", changed);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { element?.removeEventListener("scroll", scrolled); window.removeEventListener("resize", scrolled); clearTimeout(timer); document.removeEventListener("selectionchange", changed); document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [root]);
  async function runTranslation(target = language) {
    if (!selection) return;
    const id = ++request.current;
    setTranslation({ text: "", pending: true });
    try {
      const text = await translate(selection.text, target);
      if (id === request.current) setTranslation({ text, pending: false });
    } catch (error) {
      if (id === request.current) setTranslation({ text: error instanceof Error ? error.message : "Translation failed", pending: false, error: true });
    }
  }
  return <>
    <ConversationAnnotations root={root} references={references} editingId={editingId} onEdit={onEdit} onChange={onReferencesChange} />
    <ConversationFind root={root} items={items} search={search} showHit={showHit} onClose={onCloseSearch} onOpen={() => { request.current++; setSelection(null); setTranslation(null); onSearch(); }} />
    {selection && createPortal(<div ref={popup} className={`selection-tools ${translation ? "has-translation" : ""}`} style={position} onPointerDown={event => event.stopPropagation()}>
      <div className="selection-actions">
        <button type="button" disabled={[...selection.text].length > 8000} onClick={() => {
          window.getSelection()?.removeAllRanges();
          onReference({ id: crypto.randomUUID(), messageId: selection.messageId, startOffset: selection.startOffset, text: selection.text, comment: "" });
          setSelection(null);
        }}><MessageSquareQuote size={15} />Add to conversation</button>
        <button type="button" disabled={translation?.pending || [...selection.text].length > 8000} onClick={() => void runTranslation()}><Languages size={15} />Translate</button>
      </div>
      {[...selection.text].length > 8000 && <small>Select up to 8,000 characters.</small>}
      {translation && <div className="selection-translation">
        <div><span>{language === "zh-CN" ? "Chinese" : "English"}</span><button type="button" aria-label="Close translation" onClick={() => { request.current++; setSelection(null); setTranslation(null); }}><X size={16} /></button></div>
        <p role={translation.error ? "alert" : "status"}>{translation.pending ? "Translating…" : translation.text}</p>
      </div>}
    </div>, document.body)}
  </>;
}
