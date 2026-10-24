import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Languages, MessageSquareQuote, X } from "lucide-react";
import type { ConversationReference } from "../../shared/conversationReferences";
import type { TranslationResult } from "../../shared/clientTypes";
import { ConversationAnnotations, useAnchoredPopup } from "./ConversationAnnotations";
export { ComposerReferences } from "./ConversationAnnotations";
import { selectionOffset } from "./annotationRange";
import { conversationSelection } from "./selectionText";
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
  translate: (text: string, language: "zh-CN" | "en") => Promise<TranslationResult>;
  translationProfile: string;
  items: DisplayItem[];
  search: (query: string) => Promise<SessionSearchResponse>;
  showHit: (hit: SessionSearchHit, signal: AbortSignal) => Promise<void>;
  onCloseSearch: () => void;
  onSearch: () => void;
};
type SelectionText = { text: string; messageId?: string; startOffset: number; rect: DOMRect; range: Range; visible: boolean };

export function ConversationTools({ root, onReference, translate, translationProfile, items, search, showHit, onCloseSearch, onSearch, language, references, editingId, onEdit, onReferencesChange }: Props) {
  useLocale();
  const [selection, setSelection] = useState<SelectionText | null>(null);
  const [translation, setTranslation] = useState<(TranslationResult & { pending: boolean; error?: boolean; language: "zh-CN" | "en" }) | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const position = useAnchoredPopup(popup, selection?.rect ?? null);
  const request = useRef(0);
  const translationOpen = translation !== null;
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (popup.current?.contains(document.activeElement)) return;
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed || !selected.rangeCount) { if (!translationOpen) setSelection(null); return; }
        if (popup.current?.contains(selected.getRangeAt(0).startContainer)) return;
        const match = root.current && conversationSelection(selected.getRangeAt(0), root.current);
        if (!match) { if (!translationOpen) setSelection(null); return; }
        const { text, range, reference } = match;
        const rect = range.getBoundingClientRect();
        request.current++; setTranslation(null);
        setSelection({ text, range, visible: true, messageId: reference?.message.dataset.messageId, rect,
          startOffset: reference ? selectionOffset(reference.message, range) + range.toString().indexOf(text) : 0 });
      }, 150);
    };
    let pointerStart: { x: number; y: number } | null = null;
    const outsidePointer = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
    const outsideClick = (event: MouseEvent) => {
      if (popup.current?.contains(event.target as Node)) return;
      if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) return;
      const selected = window.getSelection();
      if (selected && !selected.isCollapsed && root.current?.contains(selected.anchorNode)) return;
      request.current++; setTranslation(null); setSelection(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { request.current++; setSelection(null); setTranslation(null); } };
    let frame = 0;
    const scrolled = () => {
      if (translationOpen || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setSelection(current => {
          const container = root.current;
          if (!current || !container) return current;
          if (!container.contains(current.range.commonAncestorContainer)) return null;
          const bounds = container.getBoundingClientRect();
          const rects = Array.from(current.range.getClientRects());
          const rect = rects.find(rect => rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(window.innerHeight, bounds.bottom));
          return { ...current, rect: rect ?? current.rect, visible: !!rect };
        });
      });
    };
    document.addEventListener("scroll", scrolled, { passive: true, capture: true });
    window.addEventListener("resize", scrolled);
    document.addEventListener("selectionchange", changed);
    document.addEventListener("pointerdown", outsidePointer);
    document.addEventListener("click", outsideClick);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("scroll", scrolled, true); cancelAnimationFrame(frame); window.removeEventListener("resize", scrolled); clearTimeout(timer); document.removeEventListener("selectionchange", changed); document.removeEventListener("pointerdown", outsidePointer); document.removeEventListener("click", outsideClick); document.removeEventListener("keydown", escape); };
  }, [root, translationOpen]);
  async function runTranslation(target = language) {
    if (!selection) return;
    const id = ++request.current;
    setTranslation({ text: "", pending: true, profile: translationProfile || undefined, language: target });
    try {
      const result = await translate(selection.text, target);
      if (id === request.current) setTranslation({ ...result, pending: false, language: target });
    } catch (error) {
      if (id === request.current) setTranslation({ text: error instanceof Error ? error.message : t("conversationTools.translationFailed"), pending: false, error: true, profile: translationProfile || undefined, language: target });
    }
  }
  return <>
    <ConversationAnnotations root={root} references={references} editingId={editingId} onEdit={onEdit} onChange={onReferencesChange} />
    <ConversationFind root={root} items={items} search={search} showHit={showHit} onClose={onCloseSearch} onOpen={() => { request.current++; setSelection(null); setTranslation(null); onSearch(); }} />
    {selection && createPortal(<div ref={popup} className={`selection-tools ${translation ? "has-translation" : ""}`} style={{ ...position, visibility: !translation && !selection.visible ? "hidden" : undefined }} onPointerDown={event => event.stopPropagation()}>
      <div className="selection-actions">
        {selection.messageId && <button type="button" disabled={[...selection.text].length > 8000} onClick={() => {
          if (!selection.messageId) return;
          window.getSelection()?.removeAllRanges();
          onReference({ id: crypto.randomUUID(), messageId: selection.messageId, startOffset: selection.startOffset, text: selection.text, comment: "" });
          setSelection(null);
        }}><MessageSquareQuote size={15} />{t("conversationTools.addToConversation")}</button>}
        <button type="button" disabled={translation?.pending || [...selection.text].length > 8000} onClick={() => void runTranslation()}><Languages size={15} />{t("conversationTools.translate")}</button>
      </div>
      {[...selection.text].length > 8000 && <small>{t("conversationTools.selectUpTo8000Characters")}</small>}
      {translation && <div className="selection-translation">
        <div><span>{translation.language === "zh-CN" ? t("settingsPage.chinese") : t("settingsPage.english")}</span><button type="button" aria-label={t("conversationTools.closeTranslation")} onClick={() => { request.current++; setSelection(null); setTranslation(null); }}><X size={16} /></button></div>
        <p role={translation.error ? "alert" : "status"}>{translation.pending ? t("conversationTools.translating") : translation.text}</p>
        {(translation.profile || translation.model) && <small className="translation-model">{translation.profile && <>{t("conversationTools.profile")}{" "}{translation.profile}</>}{translation.model && <> {t("conversationTools.model")}{" "}{translation.model}</>}</small>}
      </div>}
    </div>, document.body)}
  </>;
}
