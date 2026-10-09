import { useEffect, useState } from "react";
import { AlertCircle, Check, File, FileText, Film, LoaderCircle, X } from "lucide-react";
import type { ComposerAttachment } from "./ConversationComposer";

export function AttachmentCard({ attachment, onPreview, onRemove }: {
  attachment: ComposerAttachment; onPreview(): void; onRemove(): void;
}) {
  const [text, setText] = useState("");
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const isText = attachment.mimeType.startsWith("text/") || /\.(txt|md|json|csv|log|yaml|yml|js|ts|py|go)$/i.test(attachment.name);
  useEffect(() => {
    let cancelled = false;
    if (isText) void attachment.file.slice(0, 2048).text().then(value => { if (!cancelled) setText(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [attachment.file, isText]);
  const uploading = attachment.upload?.state === "uploading";
  const failed = attachment.upload?.state === "failed";
  const ready = attachment.upload?.state === "ready";
  const Icon = attachment.kind === "video" ? Film : isText ? FileText : File;
  const status = uploading ? "Uploading…" : failed ? "Upload failed · click to retry" : ready ? "Uploaded · click to preview" : "Click to preview";
  return <div className={`composer-attachment attachment-card${attachment.kind === "image" ? " attachment-card-image" : ""}`}>
    <button type="button" className="attachment-preview-button" aria-label={`${failed ? "Retry upload" : "Preview"} ${attachment.name}`} title={failed ? `${attachment.name}\n${attachment.upload?.state === "failed" ? attachment.upload.error : ""}\n${status}` : `${attachment.name}\n${status}`} onClick={onPreview}>
      <div className="attachment-card-media">
        {attachment.kind === "image" ? <img src={attachment.url} alt={attachment.name} />
          : attachment.kind === "video" && !mediaFailed ? <video src={attachment.url} muted playsInline preload="metadata" onLoadedMetadata={event => { event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration / 2 || 0); }} onSeeked={() => setMediaReady(true)} onLoadedData={() => setMediaReady(true)} onError={() => setMediaFailed(true)} />
          : text ? <pre>{text}</pre> : <Icon size={32} strokeWidth={1.5} />}
        {(uploading || (attachment.kind === "video" && !mediaReady && !mediaFailed)) && <span className="attachment-card-overlay"><LoaderCircle className="attachment-spinner" size={24} /><span className="sr-only">{status}</span></span>}
        {failed && <span className="attachment-card-overlay attachment-card-error"><AlertCircle size={24} /><span>Retry upload</span></span>}
      </div>
      {attachment.kind !== "image" && <div className="attachment-card-caption"><Icon size={16} /><span>{attachment.name}</span>{ready && <Check size={13} className="attachment-uploaded" />}</div>}
    </button>
    <button type="button" className="composer-attachment-remove" aria-label={`Remove ${attachment.name}`} onClick={onRemove}><X size={14} /></button>
  </div>;
}
