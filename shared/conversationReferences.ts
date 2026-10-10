export type ConversationReference = { id: string; messageId: string; text: string; comment: string; startOffset?: number };

// Quotes remain ordinary text input on every runtime. No private Codex payload is required.
export function referencePrompt(prompt: string, references: ConversationReference[] = []): string {
  const quotes = references.map((ref, index) => `[Reference ${index + 1}](#message-${encodeURIComponent(ref.messageId)}):\n\n${ref.text.split("\n").map(line => `> ${line}`).join("\n")}${ref.comment.trim() ? `\n\nComment: ${ref.comment.trim()}` : ""}`);
  return [...quotes, prompt].filter(Boolean).join("\n\n");
}
