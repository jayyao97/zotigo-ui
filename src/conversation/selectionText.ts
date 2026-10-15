const selectionChrome = 'button, input, textarea, [aria-hidden="true"], script, style, .turn-actions, .message-kicker, .message-skills, .user-message-toggle';

// Triple-click paragraph selection can end at the next message's offset zero.
// Keep the selected message when only trailing whitespace crosses its boundary.
export function selectedMessageRange(selected: Range, root: HTMLElement): { message: HTMLElement; range: Range } | null {
  const start = selected.startContainer.nodeType === 1 ? selected.startContainer as Element : selected.startContainer.parentElement;
  const message = start?.closest<HTMLElement>('[data-message-id], .reasoning-block');
  if (!message || !root.contains(message) || start?.closest(selectionChrome)) return null;
  const range = selected.cloneRange();
  if (!message.contains(range.endContainer)) {
    const trailing = range.cloneRange();
    trailing.setStart(message, message.childNodes.length);
    if (trailing.toString().trim()) return null;
    range.setEnd(message, message.childNodes.length);
  }
  return { message, range };
}

// Translation may span message/thinking blocks; references still require one
// exact message range. Walk only the selected subtree and omit UI controls.
export function conversationSelection(selected: Range, root: HTMLElement) {
  const single = selectedMessageRange(selected, root);
  const range = single?.range ?? selected.cloneRange();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const element = (node: Node) => node.nodeType === 1 ? node as Element : node.parentElement;
  const supported = (node: Node) => element(node)?.closest('[data-message-id], .reasoning-block');
  if (!single && (!supported(range.startContainer) || !supported(range.endContainer))) return null;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(range.commonAncestorContainer, 4);
  const parts: string[] = [];
  let paragraph: Element | null = null;
  let hasThinking = false;
  let hasExcludedText = false;
  let node: Node | null = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer : walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (supported(node) && range.intersectsNode(node)) {
      const slice = doc.createRange();
      slice.selectNodeContents(node);
      if (node === range.startContainer) slice.setStart(node, range.startOffset);
      if (node === range.endContainer) slice.setEnd(node, range.endOffset);
      const text = slice.toString();
      if (parent?.closest(selectionChrome)) {
        hasExcludedText ||= !!text.trim();
      } else if (text) {
        const block = parent?.closest('p, li, pre, blockquote, h1, h2, h3, h4, h5, h6, [data-message-id], .reasoning-block') ?? null;
        if (parts.length && block !== paragraph) parts.push("\n\n");
        parts.push(text);
        paragraph = block;
        hasThinking ||= !!parent?.closest('.reasoning-block');
      }
    }
    node = walker.nextNode();
  }
  const reference = single?.message.dataset.messageId && !hasThinking && !hasExcludedText ? single : null;
  // Reference text must retain its original offsets and whitespace.
  const text = (reference ? range.toString() : parts.join("")).trim();
  return text ? { text, range, reference } : null;
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
