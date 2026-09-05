export function titleFromPrompt(prompt: string, now = new Date()): string {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return `New chat ${formatShortDate(now)}`;
  }
  return firstLine.length > 54 ? `${firstLine.slice(0, 51)}...` : firstLine;
}

function formatShortDate(value: Date): string {
  return value.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
