import { useEffect, useRef, useState } from "react";
import { Check, Code2, Copy, Network, RefreshCw } from "lucide-react";
import { PreviewImage } from "./ImagePreview";
import { renderMermaid } from "./renderMermaid";

export function MermaidCodeBlock({ code }: { code: string }) {
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
        if (active) setResult({ code, error: "Diagram unavailable. The source may be incomplete or invalid." });
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
      <Network size={17} aria-hidden="true" /><span>Mermaid</span>
      <div className="markdown-code-block-actions">
        <button type="button" aria-label={source ? "Show diagram" : "Show source"} title={source ? "Show diagram" : "Show source"}
          aria-pressed={source} onClick={() => setSource(!source)}><Code2 size={17} /></button>
        {current?.error && <button type="button" aria-label="Retry diagram" title="Retry diagram" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}><RefreshCw size={17} /></button>}
        <button type="button" aria-label={copied ? "Copied" : "Copy diagram source"} title={copied ? "Copied" : "Copy diagram source"} onClick={() => void copy()}>
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
    </div>
    {copyError && <p className="mermaid-status" role="status">Could not copy. Select and copy the source instead.</p>}
    {!source && current?.url
      ? <div className="mermaid-diagram"><PreviewImage key={current.url} src={current.url} alt="Mermaid diagram.svg" /></div>
      : <>
        {!source && <p className="mermaid-status" role="status">{current?.error ?? "Preparing diagram…"}</p>}
        <pre><code className="language-mermaid">{code}</code></pre>
      </>}
  </div>;
}
