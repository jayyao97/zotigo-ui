import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, Code2, Copy, WrapText } from "lucide-react";
import { MermaidCodeBlock } from "./MermaidCodeBlock";

type CodeElementProps = {
  children?: ReactNode;
  className?: string;
};

const languageLabels: Record<string, string> = {
  css: "CSS",
  get dockerfile() { return t("markdownCodeBlock.dockerfile"); },
  go: "Go",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  get markdown() { return t("markdownCodeBlock.markdown"); },
  get mathematica() { return t("markdownCodeBlock.mathematica"); },
  matlab: "MATLAB",
  get md() { return t("markdownCodeBlock.markdown"); },
  get nginx() { return t("markdownCodeBlock.nginx"); },
  get plaintext() { return t("markdownCodeBlock.plaintext"); },
  powershell: "PowerShell",
  get py() { return t("markdownCodeBlock.python"); },
  get python() { return t("markdownCodeBlock.python"); },
  get shell() { return t("markdownCodeBlock.shell"); },
  get sh() { return t("markdownCodeBlock.shell"); },
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

export function MarkdownCodeBlock({ children }: ComponentPropsWithoutRef<"pre">) {
  useLocale();
  if (Children.count(children) === 1 && isValidElement<CodeElementProps>(children)
    && /(?:^|\s)language-mermaid(?:\s|$)/i.test(children.props.className ?? "")) {
    const code = Children.toArray(children.props.children).join("").replace(/\n$/, "");
    return <MermaidCodeBlock code={code} />;
  }
  return <HighlightedCodeBlock>{children}</HighlightedCodeBlock>;
}

function HighlightedCodeBlock({ children }: ComponentPropsWithoutRef<"pre">) {
  useLocale();
  const codeElement = Children.count(children) === 1 && isValidElement<CodeElementProps>(children)
    ? children as ReactElement<CodeElementProps>
    : null;
  const code = codeElement ? Children.toArray(codeElement.props.children).join("").replace(/\n$/, "") : "";
  const language = codeElement?.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1]?.toLowerCase();
  const title = language ? languageLabels[language] ?? language : t("markdownCodeBlock.code");
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  useEffect(() => {
    setHighlightedHtml(null);
    let disposed = false;
    let observer: IntersectionObserver | null = null;
    const highlight = () => {
      void import("./highlightCode").then(({ highlightCode }) => {
        if (disposed) return;
        const result = highlightCode(code, language);
        if (result) setHighlightedHtml(result.html);
      }).catch((error) => console.warn("[zotigo] syntax highlighter unavailable:", error));
    };
    const block = blockRef.current;
    if (!block || typeof IntersectionObserver === "undefined") {
      highlight();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        observer = null;
        highlight();
      }, { rootMargin: "600px 0px" });
      observer.observe(block);
    }
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [code, language]);

  if (!codeElement) return <pre>{children}</pre>;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div ref={blockRef} className={`markdown-code-block ${wrap ? "wrap" : ""}`}>
      <div className="markdown-code-block-header">
        <Code2 size={17} strokeWidth={1.8} aria-hidden="true" />
        <span>{title}</span>
        <div className="markdown-code-block-actions">
          <button
            type="button"
            aria-label={wrap ? t("markdownCodeBlock.disableWordWrap") : t("markdownCodeBlock.enableWordWrap")}
            title={wrap ? t("markdownCodeBlock.disableWordWrap") : t("markdownCodeBlock.enableWordWrap")}
            aria-pressed={wrap}
            onClick={() => setWrap((value) => !value)}
          >
            <WrapText size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={copied ? t("markdownCodeBlock.copied") : t("markdownCodeBlock.copyCode")}
            title={copied ? t("markdownCodeBlock.copied") : t("markdownCodeBlock.copyCode")}
            onClick={() => void copyCode()}
          >
            {copied
              ? <Check size={17} strokeWidth={1.9} aria-hidden="true" />
              : <Copy size={17} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <pre>
        {highlightedHtml === null
          ? codeElement
          : <code className={codeElement.props.className} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />}
      </pre>
    </div>
  );
}
