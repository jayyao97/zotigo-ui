const composerMaxRows = 13;

export function composerTextareaSizing(input: {
  scrollHeight: number;
  lineHeight: number;
  minHeight: number;
}): { height: number; overflowY: "auto" | "hidden" } {
  const maxHeight = input.lineHeight * composerMaxRows;
  return {
    height: Math.max(input.minHeight, Math.min(input.scrollHeight, maxHeight)),
    overflowY: input.scrollHeight > maxHeight ? "auto" : "hidden",
  };
}

export function resizeTextareaToContent(element: HTMLTextAreaElement | null): void {
  if (!element) return;
  element.style.height = "auto";
  const style = window.getComputedStyle(element);
  const sizing = composerTextareaSizing({
    scrollHeight: element.scrollHeight,
    lineHeight: Number.parseFloat(style.lineHeight) || 20,
    minHeight: Number.parseFloat(style.minHeight) || 36,
  });
  element.style.height = `${sizing.height}px`;
  element.style.overflowY = sizing.overflowY;
}
