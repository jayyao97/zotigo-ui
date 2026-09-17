import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import { listChannelConnections, listChannelConversations, listChannelGroupMembers, listChannelGroups, setDaemonBaseUrl, UnsupportedChannelsError, updateChannelConversation, ZotigodRequestError } from "../backend/zotigod";

let server: http.Server;
let mode: "valid" | "legacy" | "malformed" | "missing" = "valid";
const timestamp = new Date(0).toISOString();

before(async () => {
  server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (mode === "missing") {
      response.statusCode = 404;
      response.end(JSON.stringify({ code: "not_found", message: "not found" }));
      return;
    }
    if (request.url === "/channels/connections") {
      response.end(JSON.stringify({ code: "ok", data: { connections: [connection()] } }));
      return;
    }
    if (request.url === "/channels/conversations?connection_id=connection-1") {
      const value = conversation();
      if (mode === "malformed") value.allowed_sender_ids = "owner-1";
      if (mode === "legacy") {
        delete value.chat_mode;
        delete value.session_strategy;
        delete value.agent;
        delete value.profile_name;
        delete value.model;
        delete value.reasoning_effort;
      }
      response.end(JSON.stringify({ code: "ok", data: { conversations: [value] } }));
      return;
    }
    if (request.url === "/channels/connections/connection-1/groups") {
      response.end(JSON.stringify({ code: "ok", data: { groups: [{
        chat_id: "chat-1", chat_mode: "topic", name: "Topic group", available: true,
        conversation_id: "conversation-1", ...conversationRuntime(), enabled: true,
      }] } }));
      return;
    }
    if (request.url === "/channels/connections/connection-1/groups/chat-1/members") {
      response.end(JSON.stringify({ code: "ok", data: { members: [{ id: "owner-1", display_name: "Owner" }] } }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "not_found", message: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
});

after(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

test("Channels responses are parsed at runtime", async () => {
  mode = "valid";
  const connections = await listChannelConnections();
  assert.equal(connections[0]?.provider, "feishu");
  assert.deepEqual(connections[0]?.owner_sender_ids, []);
  const conversations = await listChannelConversations("connection-1");
  assert.equal(conversations[0]?.chat_type, "group");
  assert.equal(conversations[0]?.chat_mode, "topic");
  assert.deepEqual(conversations[0]?.observed_senders, []);
  assert.equal(conversations[0]?.sender_policy, "selected");
  assert.deepEqual({
    agent: conversations[0]?.agent,
    model: conversations[0]?.model,
    reasoning_effort: conversations[0]?.reasoning_effort,
  }, { agent: "codex", model: "gpt-5", reasoning_effort: "high" });
});

test("Channel group mode is parsed at runtime", async () => {
  mode = "valid";
  const groups = await listChannelGroups("connection-1");
  assert.equal(groups[0]?.chat_mode, "topic");
});

test("Channel group members are parsed at runtime", async () => {
  mode = "valid";
  assert.deepEqual(await listChannelGroupMembers("connection-1", "chat-1"), [{ id: "owner-1", display_name: "Owner" }]);
});

test("malformed Channels payloads fail before reaching the UI", async () => {
  mode = "malformed";
  await assert.rejects(() => listChannelConversations("connection-1"), /allowed_sender_ids must be an array/);
});

test("Channel conversations from older daemons default to the Zotigo workspace profile", async () => {
  mode = "legacy";
  const conversations = await listChannelConversations("connection-1");
  assert.deepEqual({
    chat_mode: conversations[0]?.chat_mode,
    session_strategy: conversations[0]?.session_strategy,
    agent: conversations[0]?.agent,
    profile_name: conversations[0]?.profile_name,
    model: conversations[0]?.model,
    reasoning_effort: conversations[0]?.reasoning_effort,
  }, { chat_mode: undefined, session_strategy: "topic", agent: "zotigo", profile_name: "", model: "", reasoning_effort: "" });
});

test("old daemons receive a specific Channels compatibility error", async () => {
  mode = "missing";
  await assert.rejects(() => listChannelConnections(), (error: unknown) => error instanceof UnsupportedChannelsError);
});

test("a missing Channel resource remains a normal not-found error", async () => {
  mode = "missing";
  await assert.rejects(() => updateChannelConversation("missing", {
    display_name: "", session_strategy: "topic", session_id: "", workspace_id: "", enabled: false, sender_policy: "selected", allowed_sender_ids: [],
    agent: "zotigo", profile_name: "", model: "", reasoning_effort: "",
    agent_instructions_mode: "inherit", agent_instructions: "", approval_instructions_mode: "inherit", approval_instructions: "",
  }), (error: unknown) => error instanceof ZotigodRequestError && error.status === 404);
});

function connection() {
  return {
    id: "connection-1", provider: "feishu", name: "Shadow Yao", app_id: "app", has_secret: true,
    enabled: true, status: "running", allow_chat_ids: null, owner_sender_ids: null,
    agent_instructions: "", approval_instructions: "", review_all_tools: true,
    progress_mode: "cot", cot_available: true, created_at: timestamp, updated_at: timestamp,
  };
}

function conversation(): Record<string, unknown> {
  return {
    id: "conversation-1", connection_id: "connection-1", chat_id: "chat-1", chat_type: "group", chat_mode: "topic",
    display_name: "Topic", ...conversationRuntime(), enabled: true, allowed_sender_ids: ["owner-1"], observed_senders: null,
    agent_instructions_mode: "replace", agent_instructions: "", approval_instructions_mode: "replace",
    approval_instructions: "", review_all_tools: true, last_activity_at: timestamp, created_at: timestamp, updated_at: timestamp,
  };
}

function conversationRuntime() {
  return { session_strategy: "topic", sender_policy: "selected", agent: "codex", profile_name: "", model: "gpt-5", reasoning_effort: "high" } as const;
}
