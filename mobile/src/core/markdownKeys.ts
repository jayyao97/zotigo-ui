/** Append-only streaming keeps completed nodes mounted, including image load state. */
export function stableMarkdownKeys<
  T extends { key: string; type: string; children: T[] },
>(nodes: T[], prefix = "md"): T[] {
  return nodes.map((node, index) => ({
    ...node,
    key: `${prefix}.${index}.${node.type}`,
    children: stableMarkdownKeys(
      node.children,
      `${prefix}.${index}.${node.type}`,
    ),
  }));
}

type MarkdownImageNode = {
  type: string;
  children: readonly MarkdownImageNode[];
};
export function containsMarkdownImage(node: {
  type: string;
  children: readonly MarkdownImageNode[];
}): boolean {
  return node.type === "image" || node.children.some(containsMarkdownImage);
}
