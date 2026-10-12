import hljs from "highlight.js/lib/common";
export type CodeSpan = { text: string; color?: string };
const palette: Record<string, string> = {
  keyword: "#c792ea",
  built_in: "#82aaff",
  type: "#ffcb6b",
  literal: "#f78c6c",
  number: "#f78c6c",
  string: "#c3e88d",
  regexp: "#c3e88d",
  comment: "#8193a7",
  title: "#82aaff",
  attr: "#ffcb6b",
  attribute: "#ffcb6b",
  variable: "#f07178",
  tag: "#f07178",
  name: "#f07178",
  meta: "#89ddff",
};
const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};
export function highlightCode(source: string, info = ""): CodeSpan[] {
  const language = info.trim().split(/\s+/)[0].toLowerCase();
  if (source.length > 20000 || !hljs.getLanguage(language))
    return [{ text: source }];
  try {
    const html = hljs.highlight(source, {
      language,
      ignoreIllegals: true,
    }).value;
    const stack: (string | undefined)[] = [];
    const result: CodeSpan[] = [];
    for (const token of html.split(/(<[^>]+>)/g)) {
      if (token.startsWith("<span")) {
        const cls = /class="([^"]*)"/.exec(token)?.[1] ?? "";
        stack.push(
          cls
            .split(/\s+/)
            .map((c) => palette[c.replace(/^hljs-/, "")])
            .find(Boolean) ?? stack.at(-1),
        );
      } else if (token === "</span>") stack.pop();
      else if (token)
        result.push({
          text: token.replace(
            /&(?:amp|lt|gt|quot|#x27|#39);/g,
            (e) => entities[e],
          ),
          color: stack.at(-1),
        });
      if (result.length > 3000) return [{ text: source }];
    }
    return result.map((s) => s.text).join("") === source
      ? result
      : [{ text: source }];
  } catch {
    return [{ text: source }];
  }
}
