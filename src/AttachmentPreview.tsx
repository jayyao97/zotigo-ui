import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ComposerAttachment } from "./conversation/ConversationComposer";

export function AttachmentPreview({ attachment, onClose }: { attachment: ComposerAttachment; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return createPortal(
    <dialog ref={dialog} className="attachment-file-preview" aria-label={attachment.name} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section>
        <header><span>{attachment.name}</span><button type="button" autoFocus aria-label="Close preview" onClick={onClose}><X size={18} /></button></header>
        {attachment.kind === "video"
          ? <video src={attachment.url} controls playsInline preload="metadata" />
          : <p>File attached · {Math.ceil(attachment.file.size / 1024)} KiB</p>}
      </section>
    </dialog>, document.body,
  );
}
