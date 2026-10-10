// Match across inline Markdown elements without modifying React-owned DOM.
export function textRanges(root: HTMLElement, query: string, limit = 1000): Range[] {
  if (!query || limit < 1) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('input, textarea, [aria-hidden="true"], script, style')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: { node: Text; start: number; end: number }[] = [];
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  const ranges: Range[] = [];
  // Escaping and /iu preserve original string offsets, including Unicode case mappings.
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  let firstIndex = 0;
  let lastIndex = 0;
  for (const match of text.matchAll(expression)) {
    // A very long/repetitive message must not allocate unbounded DOM Ranges.
    if (ranges.length >= limit) break;
    const start = match.index!;
    const end = start + match[0].length;
    while (firstIndex < nodes.length && nodes[firstIndex].end <= start) firstIndex++;
    while (lastIndex < nodes.length && nodes[lastIndex].end < end) lastIndex++;
    const first = nodes[firstIndex];
    const last = nodes[lastIndex];
    if (!first || !last) continue;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    ranges.push(range);
  }
  return ranges;
}
