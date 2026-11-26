export type MarkdownLink =
  | { kind: "anchor"; anchor: string }
  | { kind: "external"; url: string }
  | { kind: "local"; path: string; line?: number; column?: number };

const externalProtocols = new Set(["http:", "https:", "mailto:"]);
const lineFragmentPattern = /#L(\d+)(?:C(\d+))?$/i;
const lineSuffixPattern = /:(\d+)(?::(\d+))?$/;

export function parseMarkdownLink(href: string): MarkdownLink {
  const trimmed = href.trim();
  if (!trimmed) throw new Error("Link is empty.");
  if (trimmed.startsWith("#")) return { kind: "anchor", anchor: trimmed.slice(1) };

  const protocol = protocolOf(trimmed);
  if (protocol && externalProtocols.has(protocol)) return { kind: "external", url: trimmed };
  if (protocol && protocol !== "file:") throw new Error(`Unsupported link protocol: ${protocol}`);

  const decodePath = (value: string) => protocol === "file:" ? value : decodeLinkPath(value);
  const fragmentMatch = trimmed.match(lineFragmentPattern);
  if (fragmentMatch) {
    return {
      kind: "local",
      path: decodePath(trimmed.slice(0, fragmentMatch.index)),
      line: Number(fragmentMatch[1]),
      column: fragmentMatch[2] ? Number(fragmentMatch[2]) : undefined,
    };
  }

  const suffixMatch = trimmed.match(lineSuffixPattern);
  if (suffixMatch && suffixMatch.index !== 1) {
    return {
      kind: "local",
      path: decodePath(trimmed.slice(0, suffixMatch.index)),
      line: Number(suffixMatch[1]),
      column: suffixMatch[2] ? Number(suffixMatch[2]) : undefined,
    };
  }
  return { kind: "local", path: decodePath(trimmed) };
}

function protocolOf(value: string): string | null {
  const match = /^([a-z][a-z\d+.-]*):/i.exec(value);
  return match ? `${match[1].toLowerCase()}:` : null;
}

function decodeLinkPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("Link contains invalid URL encoding.");
  }
}

/**
 * What "Copy link" puts on the clipboard: the address for a web or mail link,
 * and for a file link its path as written, decoded, with any line and column
 * (`notes/My Plan.md:12`). Undefined for an in-page anchor, which means
 * nothing outside the conversation, and for a link this app would not open.
 */
export function markdownLinkCopyText(href: string): string | undefined {
  let link: MarkdownLink;
  try {
    link = parseMarkdownLink(href);
  } catch {
    return undefined;
  }
  if (link.kind === "external") return link.url;
  if (link.kind === "anchor") return undefined;
  return link.line ? `${link.path}:${link.line}${link.column ? `:${link.column}` : ""}` : link.path;
}
