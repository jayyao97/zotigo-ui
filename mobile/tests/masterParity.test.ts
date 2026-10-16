import { test } from "node:test";
import assert from "node:assert/strict";
import { DaemonClient } from "../src/core/client";
import {
  conversationPermissions,
  connectionPermissions,
} from "../src/core/channelPermissions";
import type {
  ChannelConversation,
  ChannelConnection,
} from "@zotigo/shared/channels";

test("read acknowledgements merge stale session responses and stay host-local", async () => {
  const read = {
    version: 3,
    read_version: 0,
    completed_sequence: 12,
    unread: true,
  };
  const calls: unknown[] = [];
  const fetcher = async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      calls.push(JSON.parse(String(init.body)));
      return Response.json({
        code: "ok",
        data: { ...read, read_version: 3, unread: false },
      });
    }
    return Response.json({ code: "ok", data: { id: "s", read_state: read } });
  };
  const host = { id: "a", name: "A", baseUrl: "https://a.test", token: "a" };
  const a = new DaemonClient(host, fetcher);
  await a.setSessionReadState("s", 3);
  assert.equal((await a.session("s")).read_state?.unread, false);
  const b = new DaemonClient({ ...host, id: "b" }, fetcher);
  assert.equal((await b.session("s")).read_state?.unread, true);
  await a.setSessionReadState("s", null);
  assert.deepEqual(calls, [{ read_version: 3 }, { unread: true }]);
});

test("channel permission updates preserve configuration and omit credential mutations", () => {
  const connection = {
    provider: "feishu",
    name: "bot",
    app_id: "app",
    enabled: true,
    allow_chat_ids: ["chat"],
    owner_sender_ids: ["owner"],
    agent_instructions: "agent",
    approval_instructions: "review",
    review_all_tools: true,
    progress_mode: "cot",
    has_secret: true,
  } as ChannelConnection;
  const input = connectionPermissions(connection, "bypass_permissions");
  assert.deepEqual(input.allow_chat_ids, ["chat"]);
  assert.deepEqual(input.owner_sender_ids, ["owner"]);
  assert.equal(input.agent_instructions, "agent");
  assert.equal("app_secret" in input, false);
  assert.equal("clear_secret" in input, false);
  const group = {
    display_name: "Group",
    session_strategy: "topic",
    enabled: true,
    allowed_sender_ids: ["member"],
    agent: "codex",
    profile_name: "profile",
    model: "model",
    reasoning_effort: "high",
    agent_instructions_mode: "replace",
    agent_instructions: "custom",
    approval_instructions_mode: "inherit",
    approval_instructions: "",
    review_all_tools: null,
  } as ChannelConversation;
  const update = conversationPermissions(group, "");
  assert.equal(update.approval_policy, "");
  assert.equal(update.sender_policy, "selected");
  assert.equal(update.session_id, "");
  assert.equal(update.workspace_id, "");
  assert.equal(update.review_all_tools, undefined);
  assert.deepEqual(update.allowed_sender_ids, ["member"]);
  assert.equal(update.agent_instructions, "custom");
});
