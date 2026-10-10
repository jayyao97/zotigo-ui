import type { ConversationReference } from "../../shared/conversationReferences";

export function selectionOffset(message: HTMLElement, range: Range): number {
  const before = message.ownerDocument.createRange();
  before.selectNodeContents(message);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

export function annotationRange(message: HTMLElement, reference: ConversationReference): Range | null {
  const text = message.textContent ?? "";
  const start = reference.startOffset ?? text.indexOf(reference.text);
  if (start < 0 || text.slice(start, start + reference.text.length) !== reference.text) return null;
  const walker = message.ownerDocument.createTreeWalker(message, NodeFilter.SHOW_TEXT);
  const range = message.ownerDocument.createRange();
  let offset = 0, started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!started && offset + node.length > start) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && offset + node.length >= start + reference.text.length) {
      range.setEnd(node, start + reference.text.length - offset);
      return range;
    }
    offset += node.length;
  }
  return null;
}
