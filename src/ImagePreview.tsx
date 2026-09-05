import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Minus, Plus, X } from "lucide-react";
import { clampImageOffset, fitImageScale, type ImageSize } from "./imageViewport";
import { useClient } from "./ClientContext";

export function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { api } = useClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [image, setImage] = useState<ImageSize | null>(null);
  const [viewport, setViewport] = useState<ImageSize>({ width: 1, height: 1 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [downloadError, setDownloadError] = useState("");
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvasRef.current!);
    return () => { observer.disconnect(); dialog.close(); };
  }, []);

  function close() {
    dialogRef.current?.close();
    onClose();
  }

  const fit = image ? fitImageScale(image, viewport) : 1;
  const scale = zoom ?? fit;
  const minimumScale = Math.min(0.1, fit);
  const position = image ? clampImageOffset(offset, image, viewport, scale) : offset;
  const pannable = image && (image.width * scale > viewport.width || image.height * scale > viewport.height);

  function changeZoom(value: number | null) {
    setZoom(value === null ? null : Math.max(minimumScale, Math.min(4, value)));
    setOffset({ x: 0, y: 0 });
  }

  async function download() {
    setDownloadError("");
    try {
      if (src.startsWith("blob:")) {
        const link = document.createElement("a");
        link.href = src;
        link.download = alt;
        link.click();
      } else {
        await api.downloadImage(src);
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download image.");
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="image-preview-dialog"
      aria-label={`Image preview: ${alt}`}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => {
        if (status !== "loaded") return;
        if (event.key === "+" || event.key === "=") changeZoom(scale * 1.25);
        else if (event.key === "-") changeZoom(scale / 1.25);
        else if (event.key === "0") changeZoom(null);
        else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && image) {
          setOffset(clampImageOffset({
            x: position.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0),
            y: position.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0),
          }, image, viewport, scale));
        } else return;
        event.preventDefault();
      }}
    >
        <div className="image-preview-toolbar">
          <button type="button" aria-label="Download image" title="Download image" onClick={() => void download()} disabled={status !== "loaded"}><Download size={18} /></button>
          <button type="button" aria-label="Close image preview" onClick={close} autoFocus><X size={18} /></button>
        </div>
        <div ref={canvasRef} className={`image-preview-canvas${pannable ? " pannable" : ""}`}
          onPointerDown={(event) => {
            if (!pannable || event.button !== 0) return;
            dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: position.x, offsetY: position.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.id !== event.pointerId || !image) return;
            setOffset(clampImageOffset({ x: drag.offsetX + event.clientX - drag.x, y: drag.offsetY + event.clientY - drag.y }, image, viewport, scale));
          }}
          onPointerUp={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onLostPointerCapture={() => { dragRef.current = null; }}
        >
          {status !== "loaded" && <p role="status">{status === "error" ? "Image could not be loaded." : "Loading image…"}</p>}
          <img src={src} alt={alt} draggable={false} hidden={status !== "loaded"}
            style={image ? { width: image.width * scale, height: image.height * scale, transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))` } : undefined}
            onLoad={(event) => { setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setStatus("loaded"); }} onError={() => setStatus("error")} />
        </div>
        {downloadError && <p className="image-preview-error" role="alert">{downloadError}</p>}
        <div className="image-preview-zoom" role="group" aria-label="Image zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => changeZoom(scale / 1.25)} disabled={status !== "loaded" || scale <= minimumScale}><Minus size={18} /></button>
          <button type="button" className="image-preview-scale" title={zoom === null ? "View at 100%" : "Fit to window (0)"} aria-label={`${Math.round(scale * 100)}%, ${zoom === null ? "view at 100%" : "fit to window"}`} onClick={() => changeZoom(zoom === null ? 1 : null)} disabled={status !== "loaded"}>{Math.round(scale * 100)}%</button>
          <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => changeZoom(scale * 1.25)} disabled={status !== "loaded" || scale >= 4}><Plus size={18} /></button>
        </div>
    </dialog>,
    document.body,
  );
}

export function PreviewImage({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="image-preview-trigger" aria-label={`Preview ${alt}`} onClick={() => setOpen(true)}>
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      </button>
      {open && <ImagePreview key={src} src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
