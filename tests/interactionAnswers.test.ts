import assert from "node:assert/strict";
import test from "node:test";
import { buildInteractionAnswers, interactionAnswersComplete } from "../shared/interactionAnswers";

test("interaction answers preserve freeform whitespace and encode Codex other notes", () => {
  const questions = [
    { id: "secret", question: "Token", is_secret: true },
    { id: "choice", question: "Choose", is_other: true, options: [{ label: "A" }] },
  ];
  const drafts = {
    secret: { value: "  keep whitespace  " },
    choice: { otherSelected: true, value: "custom answer" },
  };
  assert.equal(interactionAnswersComplete(questions, drafts), true);
  assert.deepEqual(buildInteractionAnswers(questions, drafts), {
    secret: ["user_note:   keep whitespace  "],
    choice: ["None of the above", "user_note: custom answer"],
  });
});

test("a regular option named None of the above remains distinct from synthetic Other", () => {
  const questions = [{
    id: "choice", question: "Choose", is_other: true,
    options: [{ label: "None of the above" }, { label: "A" }],
  }];
  const regular = { choice: { selected: "None of the above", otherSelected: false } };
  const other = { choice: { selected: "None of the above", otherSelected: true, value: "custom" } };

  assert.equal(interactionAnswersComplete(questions, regular), true);
  assert.deepEqual(buildInteractionAnswers(questions, regular), { choice: ["None of the above"] });
  assert.equal(interactionAnswersComplete(questions, other), true);
  assert.deepEqual(buildInteractionAnswers(questions, other), { choice: ["None of the above", "user_note: custom"] });
});

test("unanswered questions serialize as empty answer lists", () => {
  const questions = [
    { id: "freeform", question: "Optional note" },
    { id: "choice", question: "Optional choice", options: [{ label: "A" }] },
  ];
  assert.equal(interactionAnswersComplete(questions, {}), false);
  assert.deepEqual(buildInteractionAnswers(questions, {}), { freeform: [], choice: [] });
});

test("a selected option can include a user note", () => {
  const questions = [{ id: "choice", question: "Choose", options: [{ label: "A" }] }];
  const drafts = { choice: { selected: "A", value: "context" } };
  assert.equal(interactionAnswersComplete(questions, drafts), true);
  assert.deepEqual(buildInteractionAnswers(questions, drafts), { choice: ["A", "user_note: context"] });
});
