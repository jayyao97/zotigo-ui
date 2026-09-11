export function conversationAutoFollowAfterWheel(current: boolean, deltaY: number): boolean {
  return deltaY < 0 ? false : current;
}

export type ConversationScrollIntent = "up" | "down" | null;

export function conversationScrollIntentForKey(key: string, shiftKey = false): ConversationScrollIntent {
  if (key === "ArrowUp" || key === "PageUp" || key === "Home" || (key === " " && shiftKey)) return "up";
  if (key === "ArrowDown" || key === "PageDown" || key === "End" || key === " ") return "down";
  return null;
}

export function conversationAutoFollowAfterScroll(
  current: boolean,
  nearBottom: boolean,
  intent: ConversationScrollIntent,
): boolean {
  if (intent === "up") return false;
  return intent === "down" && nearBottom ? true : current;
}

export function conversationShouldLoadOlder(stickToBottom: boolean, scrollTop: number): boolean {
  return !stickToBottom && scrollTop <= 80;
}
