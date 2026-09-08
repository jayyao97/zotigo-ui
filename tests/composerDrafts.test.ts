import assert from "node:assert/strict";
import test from "node:test";
import { composerDraftKey, restoreSubmittedDraft, updateComposerDrafts } from "../src/composerDrafts";

test("keys existing session drafts independently", () => {
  assert.equal(composerDraftKey({ conversationId: "one", projectId: "project", workspaceId: "workspace" }), "conversation:one");
  assert.equal(composerDraftKey({ conversationId: "two", projectId: "project", workspaceId: "workspace" }), "conversation:two");
});

test("keys new-session drafts by project and workspace", () => {
  assert.equal(composerDraftKey({ conversationId: null, projectId: "project", workspaceId: "one" }), "new:project:one");
  assert.equal(composerDraftKey({ conversationId: null, projectId: "project", workspaceId: "two" }), "new:project:two");
  assert.equal(composerDraftKey({ conversationId: null, projectId: null, workspaceId: null }), "new:none:none");
});

test("updates one draft without disturbing another and removes empty drafts", () => {
  const initial = {
    one: { prompt: "first", attachments: ["image"], selectedSkillNames: ["one"] },
    two: { prompt: "second", attachments: [] as string[], selectedSkillNames: [] },
  };
  const updated = updateComposerDrafts(initial, "one", (draft) => ({ ...draft, prompt: "changed" }));
  assert.deepEqual(updated.two, initial.two);
  assert.deepEqual(updated.one, { prompt: "changed", attachments: ["image"], selectedSkillNames: ["one"] });
  assert.deepEqual(updateComposerDrafts(updated, "one", () => ({ prompt: "", attachments: [], selectedSkillNames: [] })), {
    two: initial.two,
  });
});

test("restores a failed submission before edits made while it was pending", () => {
  const submitted = {
    prompt: "original prompt",
    attachments: [{ id: "original" }],
    selectedSkillNames: ["original-skill"],
  };
  const current = {
    prompt: "new prompt",
    attachments: [{ id: "new" }, { id: "original" }],
    selectedSkillNames: ["new-skill", "original-skill"],
  };
  assert.deepEqual(restoreSubmittedDraft(current, submitted), {
    prompt: "original prompt\n\nnew prompt",
    attachments: [{ id: "original" }, { id: "new" }],
    selectedSkillNames: ["original-skill", "new-skill"],
  });
});
