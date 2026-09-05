import assert from "node:assert/strict";
import { test } from "node:test";

import { matchingSkills, removeSkillCommand, skillCommandQuery } from "../shared/skillCommands";

const skills = [
  { name: "review-taste", description: "Review code quality", scope: "workspace", enabled: true },
  { name: "imagegen", description: "Generate and edit images", scope: "user", enabled: true },
];

test("recognizes a trailing slash skill query and removes it after selection", () => {
  const command = skillCommandQuery("Please check /rev");
  assert.deepEqual(command, { query: "rev", start: 13 });
  assert.equal(removeSkillCommand("Please check /rev", command!), "Please check ");
  assert.equal(skillCommandQuery("path/to/file"), null);
});

test("matches skills by name or description", () => {
  assert.deepEqual(matchingSkills(skills, "image").map((skill) => skill.name), ["imagegen"]);
  assert.deepEqual(matchingSkills(skills, "quality").map((skill) => skill.name), ["review-taste"]);
  assert.equal(matchingSkills(skills, "missing").length, 0);
});
