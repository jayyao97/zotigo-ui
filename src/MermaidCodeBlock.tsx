import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { useEffect, useRef, useState } from "react";
import { Check, Code2, Copy, Network, RefreshCw } from "lucide-react";
import { PreviewImage } from "./ImagePreview";
import { renderMermaid } from "./renderMermaid";

export function MermaidCodeBlock({ code }: { code: string }) {
  useLocale();
  const [source, setSource] = useState(false);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{ code: string; url?: string; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const block = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "600px 0px" });
    observer.observe(block.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let url: string | undefined;
    // Stream updates are coalesced; incomplete input stays readable as source.
    const timer = window.setTimeout(() => {
      void renderMermaid(code).then((svg) => {
        if (!active) return;
        url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        setResult({ code, url });
      }).catch(() => {
        if (active) setResult({ code, error: t("mermaidCodeBlock.diagramUnavailableTheSourceMayBeIncompleteOr") });
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [code, visible, attempt]);

  useEffect(() => () => { if (copyTimer.current !== null) window.clearTimeout(copyTimer.current); }, []);
  const current = result?.code === code ? result : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyError(false); setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopyError(true); }
  }

  return <div className="markdown-code-block mermaid-code-block" ref={block}>
    <div className="markdown-code-block-header">
      <Network size={17} aria-hidden="true" /><span>{t("mermaidCodeBlock.mermaid")}</span>
      <div className="markdown-code-block-actions">
        <button type="button" aria-label={source ? t("mermaidCodeBlock.showDiagram") : t("mermaidCodeBlock.showSource")} title={source ? t("mermaidCodeBlock.showDiagram") : t("mermaidCodeBlock.showSource")}
          aria-pressed={source} onClick={() => setSource(!source)}><Code2 size={17} /></button>
        {current?.error && <button type="button" aria-label={t("mermaidCodeBlock.retryDiagram")} title={t("mermaidCodeBlock.retryDiagram")} onClick={() => { setResult(null); setAttempt((value) => value + 1); }}><RefreshCw size={17} /></button>}
        <button type="button" aria-label={copied ? t("markdownCodeBlock.copied") : t("mermaidCodeBlock.copyDiagramSource")} title={copied ? t("markdownCodeBlock.copied") : t("mermaidCodeBlock.copyDiagramSource")} onClick={() => void copy()}>
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
    </div>
    {copyError && <p className="mermaid-status" role="status">{t("mermaidCodeBlock.couldNotCopySelectAndCopyTheSource")}</p>}
    {!source && current?.url
      ? <div className="mermaid-diagram"><PreviewImage key={current.url} src={current.url} alt={t("mermaidCodeBlock.mermaidDiagramSvg")} /></div>
      : <>
        {!source && <p className="mermaid-status" role="status">{current?.error ?? t("mermaidCodeBlock.preparingDiagram")}</p>}
        <pre><code className="language-mermaid">{code}</code></pre>
      </>}
  </div>;
}
