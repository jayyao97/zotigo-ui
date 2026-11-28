import test from "node:test";
import assert from "node:assert/strict";
import { DaemonClient } from "../src/core/client";
import { modelDraftError } from "../src/core/modelSettings";
import type { ModelProfile } from "@zotigo/shared/modelSettings";
import { toolDetail } from "../src/core/toolDetail";
const profile: ModelProfile = { name: "api", provider: "openai", model: "model", base_url: "", thinking_level: "", context_window: 0, max_output_tokens: null, mode: "", has_api_key: true };

test("model editing accepts inherited limits and rejects invalid native form values", () => {
  assert.equal(modelDraftError(profile), undefined);
  for (const update of [{ name: "invalid name" }, { model: " " }, { base_url: "not a url" }, { base_url: "https://user:password@host.test" }, { context_window: -1 }, { max_output_tokens: 0 }, { max_output_tokens: 1.5 }, { context_window: NaN }]) {
    assert.ok(modelDraftError({ ...profile, ...update }));
  }
  assert.equal(modelDraftError({ ...profile, context_window: 200000, max_output_tokens: 32000 }), undefined);
});

test("model configuration binds host and revision, keeps omitted keys and never retries mutations", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new DaemonClient({ id: "home", name: "Home", baseUrl: "https://home.test", token: "host-token" }, async (url, init = {}) => {
    calls.push({ url, init });
    if (init.method === "PUT") return Response.json({ code: "conflict", message: "revision changed" }, { status: 409 });
    if (url.endsWith("/test")) return Response.json({ code: "ok", data: { ok: true } });
    return Response.json({ code: "ok", data: { revision: "r1", default_profile: "api", profiles: [profile] } });
  });
  const settings = await client.getModelSettings();
  await assert.rejects(client.updateModelSettings({ revision: settings.revision, action: "save", profile }), /revision changed/);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { revision: "r1", action: "save", profile });
  await client.testModelSettings({ revision: "r1", action: "save", profile, api_key: "" });
  assert.equal(JSON.parse(String(calls[2].init.body)).api_key, "");
  assert.equal(calls[2].url, "https://home.test/config/models/test");
  assert.equal(new Headers(calls[2].init.headers).get("Authorization"), "Bearer host-token");
});

test("tool results show the actual tool name and success for non-shell calls", () => {
  const value = toolDetail({ id: "read", name: "read", arguments: '{"path":"README.md"}' }, { tool_call_id: "read", text: "contents" });
  assert.equal(value.language, "read");
  assert.equal(value.status, "Success");
});

import { interactionState } from "@zotigo/shared/interactionState";
import type { DisplayItem } from "@zotigo/shared/zotigod";
test("historical questions distinguish pending, closed and unavailable state", () => {
  const request = { id: "q", sequence: 1, type: "interaction_request", turn: { id: "turn" }, interaction: { id: "q" } } as DisplayItem;
  const terminal = { id: "end", sequence: 2, type: "turn_completed", turn: { id: "turn" } } as DisplayItem;
  const start = { id: "start", sequence: 0, type: "turn_started", turn: { id: "turn" } } as DisplayItem;
  assert.equal(interactionState(request, [start, request], false), undefined);
  assert.equal(interactionState(request, [start, request], true), true);
  assert.equal(interactionState(request, [start, request, terminal], true), false);
  assert.equal(interactionState(request, [], true), undefined);
});

test("mobile web search settings keep omitted credentials and send explicit clears to the selected host", async () => {
  const requests: RequestInit[] = [];
  const client = new DaemonClient({ id: "r", name: "Remote", baseUrl: "https://remote.test", token: "token" }, async (url, init = {}) => {
    assert.equal(url, "https://remote.test/config/models");
    requests.push(init);
    return Response.json({ code: "ok", data: { revision: "r", default_profile: "", profiles: [], web_search: { provider: "tavily", has_tavily_key: true, has_deepseek_key: false } } });
  });
  assert.equal((await client.getModelSettings()).web_search?.has_tavily_key, true);
  const change = { revision: "r", action: "web_search" as const, web_search: { provider: "deepseek", tavily_key: "" } };
  await client.updateModelSettings(change);
  assert.deepEqual(JSON.parse(String(requests[1].body)), change);
  await client.updateModelSettings({ ...change, web_search: { provider: "tavily", deepseek_key: " \t " } });
  assert.deepEqual(JSON.parse(String(requests[2].body)).web_search, { provider: "tavily" });
});
