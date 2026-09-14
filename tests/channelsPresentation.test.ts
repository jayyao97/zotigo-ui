import assert from "node:assert/strict";
import test from "node:test";
import { canConfigureChannelGroup, channelGroupName, type ChannelConversation, type ChannelGroup } from "../shared/channels";

function conversation(values: Partial<ChannelConversation>): ChannelConversation {
  return {
    id: "conversation",
    connection_id: "connection",
    chat_id: "oc_shadow",
    chat_type: "group",
    display_name: "",
    session_strategy: "topic",
    enabled: false,
    allowed_sender_ids: [],
    observed_senders: [],
    agent: "zotigo",
    profile_name: "",
    model: "",
    reasoning_effort: "",
    agent_instructions_mode: "inherit",
    agent_instructions: "",
    approval_instructions_mode: "inherit",
    approval_instructions: "",
    last_activity_at: "",
    created_at: "",
    updated_at: "",
    ...values,
  };
}

test("group labels never use a legacy conversation title as the chat name", () => {
  assert.equal(channelGroupName([conversation({ display_name: "hi" })], "oc_shadow"), "oc_shadow");
  assert.equal(channelGroupName([conversation({ display_name: "hi", chat_name: " Shadow Test " })], "oc_shadow"), "Shadow Test");
  assert.equal(channelGroupName([
    conversation({ chat_id: "oc_other", chat_name: "Other group" }),
    conversation({ chat_id: "oc_shadow", root_id: "om_topic", chat_name: "Topic title" }),
    conversation({ chat_id: "oc_shadow", chat_name: "Shadow Test" }),
  ], "oc_shadow"), "Shadow Test");
  assert.equal(channelGroupName([conversation({ chat_id: "oc_other", chat_name: "Other group" })], "oc_shadow"), "oc_shadow");
});

test("durable groups remain configurable while provider discovery is unavailable", () => {
  const durable: ChannelGroup = { chat_id: "oc_shadow", name: "Shadow Test", available: false, conversation_id: "conversation", session_strategy: "topic", enabled: false, allowed_sender_ids: [], agent: "zotigo", profile_name: "", model: "", reasoning_effort: "" };
  assert.equal(canConfigureChannelGroup(durable), true);
  assert.equal(canConfigureChannelGroup({ ...durable, conversation_id: "" }), false);
});
