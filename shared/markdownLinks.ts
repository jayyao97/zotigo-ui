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

  const decoded = decodeLinkPath(trimmed);
  const fragmentMatch = decoded.match(lineFragmentPattern);
  if (fragmentMatch) {
    return {
      kind: "local",
      path: decoded.slice(0, fragmentMatch.index),
      line: Number(fragmentMatch[1]),
      column: fragmentMatch[2] ? Number(fragmentMatch[2]) : undefined,
    };
  }

  const suffixMatch = decoded.match(lineSuffixPattern);
  if (suffixMatch && suffixMatch.index !== 1) {
    return {
      kind: "local",
      path: decoded.slice(0, suffixMatch.index),
      line: Number(suffixMatch[1]),
      column: suffixMatch[2] ? Number(suffixMatch[2]) : undefined,
    };
  }
  return { kind: "local", path: decoded };
}

function protocolOf(value: string): string | null {
  const match = /^([a-z][a-z\d+.-]*):/i.exec(value);
  return match ? `${match[1].toLowerCase()}:` : null;
}

function decodeLinkPath(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    throw new Error("Link contains invalid URL encoding.");
  }
}
