const storagePrefix = "zotigo.unread-sessions";

export function unreadSessionsStorageKey(clientScope: string): string {
  return `${storagePrefix}.${clientScope}`;
}

export function workingSessionsStorageKey(clientScope: string): string {
  return `${storagePrefix}.working.${clientScope}`;
}

export function parseUnreadSessionIds(value: string | null): Set<string> {
  if (!value) return new Set();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0));
  } catch {
    return new Set();
  }
}

export function completedUnreadSessionIds(
  previousWorking: ReadonlySet<string>,
  currentWorking: ReadonlySet<string>,
  selectedConversationId: string | null,
  knownConversationIds?: ReadonlySet<string>,
): string[] {
  return [...previousWorking].filter(
    (conversationId) => !currentWorking.has(conversationId)
      && conversationId !== selectedConversationId
      && (!knownConversationIds || knownConversationIds.has(conversationId)),
  );
}

export function selectedSessionToMarkRead(
  previousConversationId: string | null,
  selectedConversationId: string | null,
): string | null {
  return selectedConversationId && selectedConversationId !== previousConversationId
    ? selectedConversationId
    : null;
}
