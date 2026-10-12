import {
  skillPromptText,
  editorSkillTokens,
} from "@zotigo/shared/skillCommands";
import {
  attachmentPrompt,
  validateAttachments,
  type DraftFile,
} from "./attachments";
import type { DaemonClient } from "./client";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
import type { Storage } from "./hosts";
import { pickedImageInput } from "./imageInput";
import {
  referencePrompt,
  type ConversationReference,
} from "./conversationReferences";
export interface Draft {
  text: string;
  skills: string[];
  inlineSkills?: boolean;
  images: MessageImageInput[];
  references?: ConversationReference[];
  files?: DraftFile[];
}
export interface Attempt {
  client_message_id: string;
  text: string;
  skills: string[];
  images: MessageImageInput[];
  steer: boolean;
  mode?: "queue";
}
export interface ComposerState {
  draft: Draft;
  attempt?: Attempt;
}
export const emptyDraft = (): Draft => ({
  text: "",
  skills: [],
  images: [],
  inlineSkills: true,
});
export function submissionAttempt(
  state: ComposerState,
  id: string,
  steer: boolean,
  mode?: "queue",
): Attempt {
  // Never change an uncertain attempt: its ID must keep exactly the same payload.
  return (
    state.attempt ?? {
      text: attachmentPrompt(
        referencePrompt(
          skillPromptText(state.draft.text, state.draft.skills),
          state.draft.references,
        ),
        state.draft.files,
      ),
      skills: state.draft.inlineSkills
        ? [
            ...new Set(
              editorSkillTokens(state.draft.text, state.draft.skills).map(
                (token) => token.name,
              ),
            ),
          ]
        : state.draft.skills,
      images: state.draft.images.map((image) =>
        pickedImageInput({ base64: image.data_base64 }),
      ),
      client_message_id: id,
      steer,
      ...(mode ? { mode } : {}),
    }
  );
}
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
      value.draft.skills.some((skill) => typeof skill !== "string") ||
      !Array.isArray(value.draft.images) ||
      (value.draft.references !== undefined &&
        (!Array.isArray(value.draft.references) ||
          value.draft.references.some(
            (ref) =>
              !ref ||
              typeof ref.id !== "string" ||
              typeof ref.messageId !== "string" ||
              typeof ref.text !== "string" ||
              typeof ref.comment !== "string" ||
              (ref.startOffset !== undefined &&
                (!Number.isInteger(ref.startOffset) || ref.startOffset < 0)),
          )))
    )
      throw new Error("Saved draft is invalid.");
    if (!value.attempt && !value.draft.inlineSkills) {
      value.draft.text = [
        ...value.draft.skills.map((name) => `[$${name}]`),
        value.draft.text,
      ]
        .filter(Boolean)
        .join(" ");
      value.draft.inlineSkills = true;
    }
    validateAttachments(value.draft.images, value.draft.files ?? []);
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

// Upload results are saved before dispatch. An uncertain send never uploads or
// reconstructs its payload again, even if the user changes settings elsewhere.
export async function prepareAttachments(
  client: DaemonClient,
  id: string,
  current: { current: ComposerState },
  store: ComposerStore,
  publish: (state: ComposerState) => void,
) {
  if (current.current.attempt) return;
  validateAttachments(
    current.current.draft.images,
    current.current.draft.files ?? [],
  );
  await store.write(current.current);
  for (
    let index = 0;
    index < (current.current.draft.files?.length ?? 0);
    index++
  ) {
    const file = current.current.draft.files![index];
    if (file.path) continue;
    const path = await client.uploadAttachment(id, file);
    const next = {
      draft: {
        ...current.current.draft,
        files: current.current.draft.files!.map((value, i) =>
          i === index ? { ...value, path } : value,
        ),
      },
    };
    await store.transition(current, next);
    publish(next);
  }
}
