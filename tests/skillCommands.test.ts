import assert from "node:assert/strict";
import { test } from "node:test";

import { editorSkillTokens, skillPromptText, skillTokens, matchingSkills, insertSkillCommand, skillCommandQuery } from "../shared/skillCommands";

const skills = [
  { name: "review-taste", description: "Review code quality", scope: "workspace", enabled: true },
  { name: "imagegen", description: "Generate and edit images", scope: "user", enabled: true },
];

test("recognizes a slash command and replaces it with an inline reference", () => {
  const command = skillCommandQuery("Please check /rev");
  assert.deepEqual(command, { query: "rev", start: 13 });
  assert.equal(insertSkillCommand("Please check /rev", command!, 17, "review-taste"), "Please check [$review-taste] ");
  assert.equal(skillCommandQuery("path/to/file"), null);
});

test("matches skills by name or description", () => {
  assert.deepEqual(matchingSkills(skills, "image").map((skill) => skill.name), ["imagegen"]);
  assert.deepEqual(matchingSkills(skills, "quality").map((skill) => skill.name), ["review-taste"]);
  assert.equal(matchingSkills(skills, "missing").length, 0);
});

test("inline skill references retain positions, repeated references and exact names", () => {
  const text = "用 $review-taste 检查，再用 $review-taste；$unknown 保持正文";
  const tokens = skillTokens(text, ["review-taste"]);
  assert.equal(tokens.length, 2);
  for (const token of tokens) assert.equal(text.slice(token.from, token.to), "$review-taste");
  assert.deepEqual(skillTokens("$review-taste-extra", ["review-taste"]), []);
  assert.deepEqual(skillTokens("已删除", ["review-taste"]), []);
});

test("selecting a skill in the middle preserves following text", () => {
  const text = "先 /rev 再整理说明";
  const caret = text.indexOf(" 再");
  const command = skillCommandQuery(text.slice(0, caret));
  assert.ok(command);
  assert.equal(insertSkillCommand(text, command, caret, "review-taste"), "先 [$review-taste]  再整理说明");
});

test("editor tokens retain identity next to prose and serialize a separate model mention", () => {
  for (const suffix of ["foo", ".", "中文"]) {
    const value = "111[$review-taste]" + suffix;
    assert.deepEqual(editorSkillTokens(value, ["review-taste"]).map(token => token.name), ["review-taste"]);
    assert.equal(skillPromptText(value, ["review-taste"]), "111$review-taste" + (suffix === "中文" ? "" : " ") + suffix);
  }
  assert.deepEqual(editorSkillTokens("$disabled-skill [$disabled-skill]", []), []);
  assert.deepEqual(editorSkillTokens("$review-taste", ["review-taste"]), []);
});
