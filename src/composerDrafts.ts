export type ComposerDraftState<Attachment> = {
  prompt: string;
  attachments: Attachment[];
  selectedSkillNames: string[];
};

export function emptyComposerDraft<Attachment>(): ComposerDraftState<Attachment> {
  return { prompt: "", attachments: [], selectedSkillNames: [] };
}

export function composerDraftKey(selection: {
  conversationId: string | null;
  projectId: string | null;
  workspaceId: string | null;
}): string {
  return selection.conversationId
    ? `conversation:${selection.conversationId}`
    : `new:${selection.projectId ?? "none"}:${selection.workspaceId ?? "none"}`;
}

export function updateComposerDrafts<Attachment>(
  drafts: Record<string, ComposerDraftState<Attachment>>,
  key: string,
  update: (draft: ComposerDraftState<Attachment>) => ComposerDraftState<Attachment>,
): Record<string, ComposerDraftState<Attachment>> {
  const nextDraft = update(drafts[key] ?? emptyComposerDraft());
  if (!nextDraft.prompt && nextDraft.attachments.length === 0 && nextDraft.selectedSkillNames.length === 0) {
    if (!(key in drafts)) return drafts;
    const next = { ...drafts };
    delete next[key];
    return next;
  }
  return { ...drafts, [key]: nextDraft };
}

export function restoreSubmittedDraft<Attachment extends { id: string }>(
  current: ComposerDraftState<Attachment>,
  submitted: ComposerDraftState<Attachment>,
): ComposerDraftState<Attachment> {
  const attachments = [...submitted.attachments];
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  for (const attachment of current.attachments) {
    if (!attachmentIds.has(attachment.id)) attachments.push(attachment);
  }
  return {
    prompt: [submitted.prompt, current.prompt].filter(Boolean).join("\n\n"),
    attachments,
    selectedSkillNames: [...new Set([...submitted.selectedSkillNames, ...current.selectedSkillNames])],
  };
}
