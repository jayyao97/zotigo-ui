import assert from "node:assert/strict";
import test from "node:test";

import { assertChannelConnectionInput, assertChannelConversationInput } from "../backend/applicationInput";

const connection = { provider: "feishu", name: "Bot", app_id: "app", enabled: true, allow_chat_ids: [], agent_instructions: "", approval_instructions: "", review_all_tools: true, progress_mode: "auto" };
const conversation = {
  display_name: "", session_strategy: "topic", session_id: "", workspace_id: "", enabled: false, sender_policy: "owners", allowed_sender_ids: [],
  agent: "zotigo", profile_name: "", model: "", reasoning_effort: "", agent_instructions_mode: "inherit", agent_instructions: "", approval_instructions_mode: "inherit", approval_instructions: "",
};

test("channel connection input carries progress detail and bind aliases only when given", () => {
  const omitted = assertChannelConnectionInput(connection);
  assert.equal(omitted.progress_detail, undefined);
  assert.equal(omitted.bind_aliases, undefined);
  const given = assertChannelConnectionInput({ ...connection, progress_detail: "full", bind_aliases: [{ name: "oncall", target: "workspace_1", extra: true }] });
  assert.equal(given.progress_detail, "full");
  assert.deepEqual(given.bind_aliases, [{ name: "oncall", target: "workspace_1" }]);
  assert.throws(() => assertChannelConnectionInput({ ...connection, progress_detail: "verbose" }), /progress_detail/);
  assert.throws(() => assertChannelConnectionInput({ ...connection, bind_aliases: [{ name: "oncall" }] }), /target/);
});

test("channel conversation input accepts an inherited or explicit progress detail", () => {
  assert.equal(assertChannelConversationInput(conversation).progress_detail, undefined);
  assert.equal(assertChannelConversationInput({ ...conversation, progress_detail: "" }).progress_detail, "");
  assert.equal(assertChannelConversationInput({ ...conversation, progress_detail: "detailed" }).progress_detail, "detailed");
  assert.throws(() => assertChannelConversationInput({ ...conversation, progress_detail: "verbose" }), /progress_detail/);
});
