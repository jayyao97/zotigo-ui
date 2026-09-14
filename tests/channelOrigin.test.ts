import assert from "node:assert/strict";
import test from "node:test";

import { formatChannelOrigin } from "../shared/channelOrigin";

test("formats trusted channel provenance without changing the message body", () => {
  assert.equal(formatChannelOrigin({
    source: "feishu",
    conversation_name: "Shadow Test",
    external_root_message_id: "om_root",
    external_thread_id: "omt_topic",
    actor: { id: "ou_owner", display_name: "姚填佳", role: "owner" },
  }), "Feishu · Shadow Test · 姚填佳 · Owner");
});

test("falls back to stable provider identifiers for unresolved members", () => {
  assert.equal(formatChannelOrigin({
    source: "feishu",
    external_conversation_id: "oc_test",
    actor: { id: "ou_member", role: "member" },
  }), "Feishu · oc_test · ou_member");
  assert.equal(formatChannelOrigin(undefined), undefined);
});
