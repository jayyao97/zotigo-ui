import type { DisplayInteractionQuestion } from "./zotigod";

export interface InteractionDraft {
  selected?: string;
  otherSelected?: boolean;
  value?: string;
}

export type InteractionDrafts = Record<string, InteractionDraft>;

export function interactionAnswersComplete(questions: DisplayInteractionQuestion[], drafts: InteractionDrafts): boolean {
  return questions.length > 0 && questions.every((question) => {
    const draft = drafts[question.id];
    if ((question.options?.length ?? 0) === 0) return Boolean(draft?.value?.trim());
    if (draft?.otherSelected) return Boolean(draft.value?.trim());
    return Boolean(draft?.selected);
  });
}

export function buildInteractionAnswers(questions: DisplayInteractionQuestion[], drafts: InteractionDrafts): Record<string, string[]> {
  return Object.fromEntries(questions.map((question) => {
    const draft = drafts[question.id] ?? {};
    if ((question.options?.length ?? 0) === 0) return [question.id, draft.value?.trim() ? [`user_note: ${draft.value}`] : []];
    if (draft.otherSelected) return [question.id, draft.value?.trim() ? ["None of the above", `user_note: ${draft.value}`] : []];
    if (!draft.selected) return [question.id, []];
    return [question.id, draft.value?.trim() ? [draft.selected, `user_note: ${draft.value}`] : [draft.selected]];
  }));
}
