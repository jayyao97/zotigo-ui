import hljs from "highlight.js/lib/common";
import arduino from "highlight.js/lib/languages/arduino";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import dos from "highlight.js/lib/languages/dos";
import latex from "highlight.js/lib/languages/latex";
import mathematica from "highlight.js/lib/languages/mathematica";
import matlab from "highlight.js/lib/languages/matlab";
import nginx from "highlight.js/lib/languages/nginx";
import pgsql from "highlight.js/lib/languages/pgsql";
import powershell from "highlight.js/lib/languages/powershell";

hljs.registerLanguage("arduino", arduino);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("dos", dos);
hljs.registerLanguage("latex", latex);
hljs.registerLanguage("mathematica", mathematica);
hljs.registerLanguage("matlab", matlab);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("pgsql", pgsql);
hljs.registerLanguage("powershell", powershell);
hljs.registerAliases(["wolfram"], { languageName: "mathematica" });

const languageAliases: Record<string, string> = {
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  sh: "shell",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
};

const maxHighlightedCodeLength = 100_000;
const maxAutoDetectedCodeLength = 10_000;

export type HighlightedCode = {
  code: string;
  html: string;
  language?: string;
};

export function highlightCode(code: string, language?: string): HighlightedCode | null {
  if (!language) {
    if (code.length > maxAutoDetectedCodeLength) return null;
    const result = hljs.highlightAuto(code);
    return { code, html: result.value, language: result.language };
  }
  if (code.length > maxHighlightedCodeLength) return null;
  const resolvedLanguage = languageAliases[language] ?? language;
  if (!hljs.getLanguage(resolvedLanguage)) return null;
  return {
    code,
    html: hljs.highlight(code, { language: resolvedLanguage }).value,
    language: resolvedLanguage,
  };
}
