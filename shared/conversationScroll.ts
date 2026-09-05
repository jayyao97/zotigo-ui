export function conversationAutoFollowAfterWheel(current: boolean, deltaY: number): boolean {
  return deltaY < 0 ? false : current;
}
