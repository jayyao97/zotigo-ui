/**
 * Request IDs that make a retried fork idempotent, as on Desktop
 * (src/conversation/useForkConversation.ts). The daemon derives the fork's ID
 * from the request ID, so a retry after an uncertain failure (a timeout, a
 * dropped connection) returns the fork that may already exist instead of
 * making a second one. After a success the ID is dropped, so forking the same
 * point again on purpose makes a new fork.
 */
export class ForkRequests {
  private ids = new Map<string, string>();
  constructor(private create: () => string) {}
  /** `turnId` undefined forks the whole conversation. */
  async fork<T>(turnId: string | undefined, send: (requestId: string) => Promise<T>): Promise<T> {
    const key = turnId ?? "";
    const id = this.ids.get(key) ?? this.create();
    this.ids.set(key, id);
    const result = await send(id);
    this.ids.delete(key);
    return result;
  }
}
