import { t, getLocale } from "./i18n/index";
export function titleFromPrompt(prompt: string, now = new Date()): string {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return t("conversationTitle.newChat", { p0: formatShortDate(now) });
  }
  return firstLine.length > 54 ? `${firstLine.slice(0, 51)}...` : firstLine;
}

function formatShortDate(value: Date): string {
  return value.toLocaleString(getLocale(), { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
