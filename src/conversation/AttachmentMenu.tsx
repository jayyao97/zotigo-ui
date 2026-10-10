import { useEffect, useRef, useState } from "react";
import { Film, Image, Paperclip, Plus } from "lucide-react";

export function AttachmentMenu({ onPick, disabled = false }: { onPick(accept?: string): void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const pick = (accept?: string) => {
    setOpen(false);
    trigger.current?.focus();
    onPick(accept);
  };
  return <div ref={root} className="composer-add-wrap">
    <button ref={trigger} type="button" className="composer-icon-button" aria-label="Add attachment" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><Plus size={20} strokeWidth={1.8} /></button>
    {open && <div className="attachment-menu" role="menu" aria-label="Upload attachment">
      <button type="button" role="menuitem" onClick={() => pick("image/*")}><Image size={16} strokeWidth={1.8} />Upload images</button>
      <button type="button" role="menuitem" onClick={() => pick()}><Paperclip size={16} strokeWidth={1.8} />Upload file</button>
      <button type="button" role="menuitem" onClick={() => pick("video/*")}><Film size={16} strokeWidth={1.8} />Upload video</button>
    </div>}
  </div>;
}
