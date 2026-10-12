export type ConversationReference = {
  id: string;
  messageId: string;
  text: string;
  comment: string;
  startOffset?: number;
};

// Quotes are ordinary prompt text, matching Desktop; no private runtime payload.
export function referencePrompt(
  prompt: string,
  references: ConversationReference[] = [],
): string {
  const quotes = references.map(
    (ref, index) =>
      `[Reference ${index + 1}](#message-${encodeURIComponent(ref.messageId)}):\n\n${ref.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join(
          "\n",
        )}${ref.comment.trim() ? `\n\nComment: ${ref.comment.trim()}` : ""}`,
  );
  return [...quotes, prompt].filter(Boolean).join("\n\n");
}
