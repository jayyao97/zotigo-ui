import { test } from "node:test";
import assert from "node:assert/strict";
import { setLocale, getLocale } from "@zotigo/shared/i18n/index";
import type { ChannelConnection, ChannelConversation } from "@zotigo/shared/channels";
import type { CatalogSource } from "@zotigo/shared/zotigod";
import {
  channelPermissionLabel,
  channelProgressDetailLabel,
  connectionPermissions,
  conversationPermissions,
} from "../src/core/channelPermissions";
import { filterSources } from "../src/core/catalog";

test("channel labels follow the app language and show progress detail as Desktop does", () => {
  const previous = getLocale();
  try {
    setLocale("en");
    assert.equal(channelPermissionLabel("bypass_permissions"), "Full access");
    const connection = { progress_detail: "detailed" } as ChannelConnection;
    assert.equal(channelProgressDetailLabel(connection), "Detailed: tool arguments and interim replies");
    assert.equal(
      channelProgressDetailLabel(connection, { progress_detail: "" } as ChannelConversation),
      "Follow the connection (Detailed: tool arguments and interim replies)",
    );
    assert.equal(
      channelProgressDetailLabel(connection, { progress_detail: "full" } as ChannelConversation),
      "Full: also the model's thinking",
    );
    // A level from a newer daemon is shown, not hidden or replaced.
    assert.match(channelProgressDetailLabel({ progress_detail: "verbose" } as never)!, /verbose/);
    // An older daemon has no such setting.
    assert.equal(channelProgressDetailLabel({} as ChannelConnection), undefined);
    setLocale("zh-CN");
    assert.notEqual(channelPermissionLabel("bypass_permissions"), "Full access");
  } finally {
    setLocale(previous);
  }
});

test("changing permissions from the phone leaves Desktop's progress detail and aliases alone", () => {
  // The daemon keeps saved values for fields a save leaves out; sending a
  // value would replace them, so mobile must never send them.
  const connection = {
    provider: "feishu", name: "Bot", app_id: "a", enabled: true, allow_chat_ids: [], agent_instructions: "",
    approval_instructions: "", review_all_tools: false, progress_mode: "auto",
    progress_detail: "full", bind_aliases: [{ name: "web", target: "s1" }],
  } as unknown as ChannelConnection;
  const body = connectionPermissions(connection, "auto");
  assert.ok(!("progress_detail" in body) && !("bind_aliases" in body));
  const group = { display_name: "g", session_strategy: "shared", enabled: true, allowed_sender_ids: [], agent: "zotigo",
    profile_name: "", model: "", reasoning_effort: "", agent_instructions_mode: "inherit", agent_instructions: "",
    approval_instructions_mode: "inherit", approval_instructions: "", progress_detail: "brief" } as unknown as ChannelConversation;
  assert.ok(!("progress_detail" in conversationPermissions(group, "")));
});

test("source search matches name, path and remote URL, and keeps chosen sources listed", () => {
  const source = (id: string, path: string, remote_url?: string) =>
    ({ id, canonical_path: path, remote_url }) as CatalogSource;
  const sources = [
    source("a", "/Users/me/code/zotigo-ui", "git@github.com:jayyao97/zotigo-ui.git"),
    source("b", "/Users/me/code/zotigo"),
    source("c", "/Users/me/notes"),
  ];
  assert.deepEqual(filterSources(sources, "").map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(filterSources(sources, "NOTES").map((s) => s.id), ["c"]);
  assert.deepEqual(filterSources(sources, "jayyao97").map((s) => s.id), ["a"]);
  assert.deepEqual(filterSources(sources, "code/zotigo").map((s) => s.id), ["a", "b"]);
  assert.deepEqual(filterSources(sources, "notes", (s) => s.id === "a").map((s) => s.id), ["a", "c"]);
});
