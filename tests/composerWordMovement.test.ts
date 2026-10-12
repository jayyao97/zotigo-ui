import assert from "node:assert/strict";
import test from "node:test";
import { composerWordPosition } from "../src/composerWordMovement";
import { alternateSendMode } from "../src/sendMode";

test("composer word navigation handles Chinese, English, and whole skill widgets", () => {
  const chinese = "先检查测试结果，再继续修改";
  assert.equal(chinese.slice(composerWordPosition(chinese, chinese.length, false, [])), "修改");
  assert.equal(composerWordPosition("hello world", 11, false, []), 6);
  assert.equal(composerWordPosition("hello world", 2, true, []), 5);
  assert.equal(composerWordPosition("hello world", 5, true, []), 11);
  const skill = "use [$review-taste] now";
  assert.equal(composerWordPosition(skill, 4, true, ["review-taste"]), 19);
  assert.equal(composerWordPosition(skill, 19, false, ["review-taste"]), 4);
  assert.equal(composerWordPosition("a\nb", 2, false, []), 1);
  assert.equal(composerWordPosition("a\nb", 1, true, []), 2);
});
test("alternate submit mode inverts either default", () => {
  assert.equal(alternateSendMode("steering"), "queue");
  assert.equal(alternateSendMode("queue"), "steering");
});
