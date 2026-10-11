import type { MessageImageInput } from "@zotigo/shared/zotigod";
import type { Storage } from "./hosts";
export interface Draft {
  text: string;
  skills: string[];
  images: MessageImageInput[];
}
export interface Attempt {
  client_message_id: string;
  text: string;
  skills: string[];
  images: MessageImageInput[];
  steer: boolean;
}
export interface ComposerState {
  draft: Draft;
  attempt?: Attempt;
}
export const emptyDraft = (): Draft => ({ text: "", skills: [], images: [] });
export class ComposerStore {
  private queue = Promise.resolve();
  readonly key: string;
  constructor(
    private storage: Storage,
    host: string,
    session: string,
  ) {
    this.key = `composer.v1.${host}.${session}`;
  }
  async read(): Promise<ComposerState> {
    await this.queue;
    const raw = await this.storage.get(this.key);
    if (!raw) return { draft: emptyDraft() };
    const value = JSON.parse(raw) as ComposerState;
    if (
      !value.draft ||
      typeof value.draft.text !== "string" ||
      !Array.isArray(value.draft.skills) ||
      !Array.isArray(value.draft.images)
    )
      throw new Error("Saved draft is invalid.");
    return value;
  }
  write(state: ComposerState): Promise<void> {
    const json = JSON.stringify(state);
    const task = this.queue.then(() => this.storage.set(this.key, json));
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  transition(
    current: { current: ComposerState },
    next: ComposerState,
  ): Promise<void> {
    // Unmount flushes this reference, so publish the intended state before an
    // asynchronous write can yield. A cleanup must never queue the prior attempt.
    current.current = next;
    return this.write(next);
  }
}
