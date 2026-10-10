// Triple-click paragraph selection can end at the next message's offset zero.
// Keep the selected message when only trailing whitespace crosses its boundary.
export function selectedMessageRange(selected: Range, root: HTMLElement): { message: HTMLElement; range: Range } | null {
  const start = selected.startContainer.nodeType === 1 ? selected.startContainer as Element : selected.startContainer.parentElement;
  const message = start?.closest<HTMLElement>('[data-message-id]');
  if (!message || !root.contains(message) || start?.closest('button, input, textarea')) return null;
  const range = selected.cloneRange();
  if (!message.contains(range.endContainer)) {
    const trailing = range.cloneRange();
    trailing.setStart(message, message.childNodes.length);
    if (trailing.toString().trim()) return null;
    range.setEnd(message, message.childNodes.length);
  }
  return { message, range };
}

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
