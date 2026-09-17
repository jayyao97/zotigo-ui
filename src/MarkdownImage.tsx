import { createContext, useContext, useEffect, useState } from "react";
import { ClientContext } from "./ClientContext";
import { PreviewImage } from "./ImagePreview";
import type { ImagePreviewResult, OpenMarkdownLinkInput } from "../shared/clientTypes";

export const MarkdownImageContext = createContext<Omit<OpenMarkdownLinkInput, "href"> | null>(null);

export function MarkdownImage({ src, alt = "Image" }: { src?: string; alt?: string }) {
  const client = useContext(ClientContext);
  const context = useContext(MarkdownImageContext);
  if (!src) return <span>{alt}</span>;
  if (/^https?:\/\//i.test(src)) return <PreviewImage src={src} alt={alt} />;
  if (!client || !context) return <span>{alt}</span>;
  // Remount on source/session changes; the immutable ClientContext scopes requests to a host.
  return <LocalImage key={JSON.stringify([src, context])} src={src} alt={alt} api={client.api} context={context} />;
}

function LocalImage({ src, alt, api, context }: {
  src: string; alt: string; api: NonNullable<React.ContextType<typeof ClientContext>>["api"];
  context: Omit<OpenMarkdownLinkInput, "href">;
}) {
  const [result, setResult] = useState<ImagePreviewResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setResult(null); setError("");
    void api.previewImage({ ...context, href: src, explicitOpen: false }).then(
      (value) => { if (active) setResult(value); },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Image unavailable"); },
    );
    return () => { active = false; };
  }, [api, src, context.basePath, context.baseKind, context.sessionId]);
  if (result?.kind === "image") return <PreviewImage src={`data:${result.file.mediaType};base64,${result.file.dataBase64}`} alt={alt} />;
  if (result?.kind === "requires_confirmation") return <a href={src} title={src}>{alt}</a>;
  return <span className="markdown-image-status" title={error || src}>{alt} · {error ? `加载失败：${error}` : "加载中…"}</span>;
}
