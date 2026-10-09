import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Check, X } from "lucide-react";

type ToastKind = "info" | "error";
type ToastItem = { id: number; text: string; kind: ToastKind };
const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const show = useCallback((text: string, kind: ToastKind = "info") => {
    const item = { id: ++sequence.current, text, kind };
    setItems((current) => [...current.filter((entry) => entry.text !== text), item].slice(-3));
  }, []);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  return <ToastContext.Provider value={show}>
    {children}
    {createPortal(<div className="app-toasts" aria-label="Notifications">{items.map((item) => <Toast key={item.id} item={item} dismiss={dismiss} />)}</div>, document.body)}
  </ToastContext.Provider>;
}

function Toast({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(item.kind === "error" ? 7000 : 4000);
  useEffect(() => {
    if (hovered || focused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(item.id), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [hovered, focused, dismiss, item.id]);
  return <div className={`app-toast ${item.kind}`} role={item.kind === "error" ? "alert" : "status"}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    {item.kind === "error" ? <CircleAlert size={17} /> : <Check size={17} />}
    <span>{item.text}</span>
    <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}><X size={16} /></button>
  </div>;
}
