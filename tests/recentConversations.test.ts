import assert from "node:assert/strict";
import test from "node:test";
import type { DesktopConversation, DesktopState } from "../shared/clientTypes";
import type { ZotigoSession } from "../shared/zotigod";
import { localDateKey, recentConversationGroups } from "../shared/recentConversations";

const now = new Date(2026, 10, 13, 12).getTime();
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).toISOString();
const conversation = (id: string, time: string): DesktopConversation => ({ id, title: id, project_id: null, workspace_id: null, created_at: time, updated_at: time });
const state = (conversations: DesktopConversation[]): DesktopState => ({ projects: [], repositories: [], folders: [], workspaces: [], conversations, bindings: [], selectedProjectId: null, selectedWorkspaceId: null, selectedConversationId: null });
const runtime = (id: string, unread: boolean): ZotigoSession => ({ id, created_at: at(1), state: "ended", live: false, working: false, read_state: { unread, version: 2, read_version: unread ? 1 : 2, completed_sequence: 4 } });

test("recent navigation prioritizes all unread, dates the rest and excludes older read sessions", () => {
  const catalog = state([conversation("old-read", at(1)), conversation("yesterday", at(12)), conversation("today", at(13)), conversation("old-unread", at(1)), conversation("new-unread", at(13, 14))]);
  const groups = recentConversationGroups(catalog, [runtime("old-unread", true), runtime("new-unread", true)], now);
  assert.deepEqual(groups.map(group => group.entries.map(entry => entry.conversation.id)), [["new-unread", "old-unread"], ["today"], ["yesterday"]]);
  assert.equal(groups[0].key, "unread");
  assert.equal(groups[1].key, localDateKey(now));
  assert.equal(catalog.conversations[0].id, "old-read", "presentation must not reorder/delete catalog entries");
});

test("seven-day cutoff uses local midnight and runtime activity can revive an old catalog entry", () => {
  const cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 6);
  const catalog = state([conversation("boundary", cutoff.toISOString()), conversation("too-old", new Date(cutoff.getTime() - 1).toISOString()), conversation("active", at(1))]);
  const groups = recentConversationGroups(catalog, [{ ...runtime("active", false), updated_at: at(13) }], now);
  assert.deepEqual(groups.flatMap(group => group.entries.map(entry => entry.conversation.id)), ["active", "boundary"]);
});

test("binding IDs resolve unread status; marking read moves or removes entries without duplicates", () => {
  const catalog = state([conversation("catalog-id", at(1))]);
  catalog.bindings = [{ conversation_id: "catalog-id", daemon_session_id: "runtime-id", created_at: at(1) }];
  assert.equal(recentConversationGroups(catalog, [runtime("runtime-id", true)], now)[0].entries[0].unread, true);
  assert.deepEqual(recentConversationGroups(catalog, [runtime("runtime-id", false)], now), []);
});

test("context uses project/workspace names, handles missing timestamps and ties deterministically", () => {
  const catalog = state([conversation("b", at(13)), conversation("a", at(13)), conversation("invalid", "invalid")]);
  catalog.conversations[0] = { ...catalog.conversations[0], project_id: "p", workspace_id: "w" };
  catalog.projects = [{ id: "p", name: "Project", created_at: at(1), updated_at: at(1) }];
  catalog.workspaces = [{ id: "w", project_id: "p", title: "Workspace", status: "ready", root_path: "/tmp/workspace", created_at: at(1), updated_at: at(1) }];
  const entries = recentConversationGroups(catalog, [], now)[0].entries;
  assert.deepEqual(entries.map(entry => entry.conversation.id), ["a", "b"]);
  assert.equal(entries[1].context, "Project / Workspace");
});
