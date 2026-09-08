import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendDisplayDelta,
  appendDisplayDeltas,
  buildToolRenderProjection,
  contentLocation,
  createOptimisticPromptId,
  ephemeralDisplayItems,
  groupReasoningItems,
  hasVisibleAssistantContent,
  groupTimelineItems,
  hasUnresolvedTurnItems,
  latestPendingToolCall,
  mergeDisplayItems,
  optimisticSteeringDisplayItem,
  optimisticPromptDisplayItem,
  acknowledgeOptimisticPrompt,
  orderLateTurnItems,
  pendingHumanRequestIDs,
  reconcileDisplayPreviews,
  reconcileOptimisticSteering,
  sessionAllowsActiveTurn,
  selectedTimelineActivity,
  visibleDisplayItems,
  workingConversationIds,
} from "../shared/sessionDisplay";
import type { DisplayItem } from "../shared/zotigod";

test("optimistic prompt IDs work without secure-context randomUUID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  const browserCrypto = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: browserCrypto });
  try {
    const ids = Array.from({ length: 100 }, () => createOptimisticPromptId());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^optimistic-prompt-[0-9a-f]{32}$/);
    const item = optimisticPromptDisplayItem({ id: ids[0], text: "hello", steering: false, createdAt: "2026-09-07T00:00:00Z" });
    assert.equal(item.id, ids[0]);
    assert.deepEqual(item.content, [{ type: "text", text: "hello" }]);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});

test("durable items reconcile temporary blocks by id and polling cannot duplicate them", () => {
  const durable = assistant("assistant-1", 3, [{ type: "text", text: "Hello" }]);
  let blocks = appendDisplayDelta([], delta("assistant-1", "Hel"), []);
  blocks = appendDisplayDelta(blocks, delta("assistant-1", "lo"), []);
  assert.equal(blocks[0].text, "Hello");

  const merged = mergeDisplayItems([durable], [durable]);
  blocks = blocks.filter((block) => !merged.some((item) => item.id === block.id));
  assert.equal(merged.length, 1);
  assert.deepEqual(blocks, []);
  assert.deepEqual(appendDisplayDelta(blocks, delta("assistant-1", " late"), merged), []);
});

test("batched display deltas preserve their arrival order", () => {
  const blocks = appendDisplayDeltas([], [
    delta("assistant-1", "one"),
    delta("assistant-1", " two"),
    delta("assistant-1", " three"),
  ], []);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "one two three");
});

test("reasoning deltas remain a live reasoning preview while they stream", () => {
  const blocks = appendDisplayDeltas([], [
    { item_id: "thinking-1", role: "assistant", part_type: "reasoning", delta: "step" },
    { item_id: "thinking-1", role: "assistant", part_type: "reasoning", delta: " one" },
  ], []);

  assert.deepEqual(ephemeralDisplayItems(blocks)[0]?.content, [{ type: "reasoning", text: "step one" }]);
});

test("poll and stream items merge by durable sequence despite public sequence gaps", () => {
  const first = assistant("assistant-1", 1, [{ type: "text", text: "one" }]);
  const later = assistant("assistant-2", 4, [{ type: "text", text: "four" }]);
  assert.deepEqual(
    mergeDisplayItems([later], [first]).map((item) => item.sequence),
    [1, 4],
  );
});

test("display item reconciliation stays correct for large histories and moved ids", () => {
  const history = Array.from({ length: 5000 }, (_, index) => assistant(
    `assistant-${index}`,
    index + 1,
    [{ type: "text", text: String(index) }],
  ));
  const moved = assistant("assistant-0", 5001, [{ type: "text", text: "updated" }]);
  const merged = mergeDisplayItems(history, [moved]);

  assert.equal(merged.length, 5000);
  assert.equal(merged.at(-1)?.id, "assistant-0");
  assert.equal(merged.at(-1)?.content?.[0]?.text, "updated");
});

test("late synchronized items render inside their original completed turn", () => {
  const started: DisplayItem = {
    id: "started-1", sequence: 1, type: "turn_started", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  };
  const paused: DisplayItem = {
    id: "paused-1", sequence: 2, type: "turn_paused", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  };
  const terminal: DisplayItem = {
    id: "terminal-1", sequence: 3, type: "turn_interrupted", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  };
  const nextUser: DisplayItem = {
    id: "user-2", sequence: 4, type: "user_message", role: "user", content: [{ type: "text", text: "next" }], created_at: new Date(0).toISOString(),
  };
  const lateAnswer = {
    ...assistant("answer-1", 5, [{ type: "text", text: "late answer" }]),
    turn: { id: "turn-1" },
  };

  assert.deepEqual(
    orderLateTurnItems([started, paused, terminal, nextUser, lateAnswer]).map((item) => item.id),
    ["started-1", "paused-1", "answer-1", "terminal-1", "user-2"],
  );
});

test("a paused turn does not move optimistic steering ahead of resumed activity", () => {
  const started: DisplayItem = {
    id: "started-1", sequence: 1, type: "turn_started", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  };
  const paused: DisplayItem = {
    id: "paused-1", sequence: 3, type: "turn_paused", turn: { id: "turn-1" }, created_at: new Date(1).toISOString(),
  };
  const resumedTool = assistant("resumed-tool", 4, [
    { type: "tool_call", tool_call: { id: "call-1", name: "shell" } },
  ]);
  const steering = optimisticSteeringDisplayItem({
    id: "steering-1",
    sequence: 0,
    type: "steering",
    text: "skip the test",
    turn_id: "turn-1",
    created_at: new Date(2).toISOString(),
  }, "session-1", "session-1", [started, paused, resumedTool]);
  assert.ok(steering);

  assert.deepEqual(
    orderLateTurnItems([started, paused, resumedTool, steering]).map((item) => item.id),
    ["started-1", "paused-1", "resumed-tool", "steering-1"],
  );
});

test("a Codex history prompt does not repeat the local prompt before its turn", () => {
  const localUser: DisplayItem = {
    id: "local-user", sequence: 1, type: "user_message", role: "user", content: [{ type: "text", text: "question" }], created_at: new Date(0).toISOString(),
  };
  const started: DisplayItem = {
    id: "started-1", sequence: 2, type: "turn_started", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  };
  const terminal: DisplayItem = {
    id: "terminal-1", sequence: 3, type: "turn_completed", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  };
  const syncedUser: DisplayItem = {
    id: "codex-user", sequence: 4, type: "user_message", role: "user", turn: { id: "turn-1" }, content: [{ type: "text", text: "question" }], created_at: new Date(0).toISOString(),
  };

  assert.deepEqual(
    visibleDisplayItems(orderLateTurnItems([localUser, started, terminal, syncedUser])).map((item) => item.id),
    ["local-user", "started-1"],
  );
  assert.deepEqual(
    visibleDisplayItems(orderLateTurnItems([localUser, started, terminal, { ...syncedUser, content: [{ type: "text", text: "question again" }] }])).map((item) => item.id),
    ["local-user", "started-1", "codex-user"],
  );
});

test("turn-bound history requests older pages only when its start is missing", () => {
  const answer = {
    ...assistant("answer-1", 5, [{ type: "text", text: "answer" }]),
    turn: { id: "turn-1" },
  };
  assert.equal(hasUnresolvedTurnItems([answer]), true);
  assert.equal(hasUnresolvedTurnItems([{
    id: "started-1", sequence: 1, type: "turn_started", turn: { id: "turn-1" }, created_at: new Date(0).toISOString(),
  }, answer]), false);
});

test("steering command becomes an optimistic user item until the durable item arrives", () => {
  const command = {
    id: "steering-1",
    sequence: 0,
    type: "steering",
    text: "change direction",
    images: [{ url: "/sessions/session-1/images/image.png", mime_type: "image/png" }],
    turn_id: "turn-1",
    created_at: new Date(0).toISOString(),
  };
  const steering = optimisticSteeringDisplayItem(command, "session-1", "session-1", []);
  assert.ok(steering);
  assert.equal(steering.sequence, Number.MAX_SAFE_INTEGER);
  assert.equal(steering.type, "steering_message");
  assert.equal(steering.role, "user");
  assert.equal(steering.content?.[0]?.text, "change direction");
  assert.equal(steering.content?.[1]?.image?.url, "/sessions/session-1/images/image.png");
  assert.equal(steering.turn?.id, "turn-1");
  assert.deepEqual(reconcileOptimisticSteering([steering], [{ ...steering, sequence: 4 }]), []);
  assert.deepEqual(
    reconcileOptimisticSteering([steering], [{
      id: "turn-completed",
      sequence: 4,
      type: "turn_completed",
      turn: { id: "turn-1" },
      created_at: new Date(1).toISOString(),
    }]),
    [steering],
  );
  assert.equal(optimisticSteeringDisplayItem(command, "session-1", "session-2", []), null);
  assert.equal(
    optimisticSteeringDisplayItem(command, "session-1", "session-1", [{
      id: "turn-completed",
      sequence: 4,
      type: "turn_completed",
      turn: { id: "turn-1" },
      created_at: new Date(1).toISOString(),
    }]),
    null,
  );
});

test("terminal durable state keeps accepted steering visible until its durable item arrives", () => {
  const steering = optimisticSteeringDisplayItem({
    id: "late-steering",
    sequence: 0,
    type: "steering",
    text: "too late",
    turn_id: "turn-1",
    created_at: new Date(0).toISOString(),
  }, "session-1", "session-1", []);
  assert.ok(steering);
  const terminal: DisplayItem = {
    id: "turn-completed",
    sequence: 4,
    type: "turn_completed",
    turn: { id: "turn-1" },
    created_at: new Date(1).toISOString(),
  };
  assert.deepEqual(reconcileOptimisticSteering([steering], [terminal]), [steering]);
  assert.deepEqual(reconcileOptimisticSteering([steering], [{ ...steering, sequence: 5 }, terminal]), []);
});

test("a submitted prompt renders immediately and adopts its durable command identity", () => {
  const local = optimisticPromptDisplayItem({
    id: "local-1",
    text: "start now",
    images: [{ url: "blob:preview", mime_type: "image/png" }],
    skills: ["review-taste"],
    steering: false,
    createdAt: new Date(0).toISOString(),
  });
  assert.equal(local.type, "user_message");
  assert.equal(local.sequence, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(local.command?.skills, ["review-taste"]);

  const acknowledged = acknowledgeOptimisticPrompt(local, {
    id: "item-1",
    sequence: 4,
    type: "steering",
    text: "start now",
    skills: ["review-taste"],
    images: [{ url: "/sessions/session-1/images/image.png", mime_type: "image/png" }],
    turn_id: "turn-1",
    created_at: new Date(1).toISOString(),
  }, []);
  assert.ok(acknowledged);
  assert.equal(acknowledged.id, "item-1");
  assert.equal(acknowledged.type, "steering_message");
  assert.equal(acknowledged.turn?.id, "turn-1");
  assert.equal(acknowledged.content?.[1]?.image?.url, "/sessions/session-1/images/image.png");
  assert.deepEqual(acknowledged.command?.skills, ["review-taste"]);
  assert.equal(acknowledgeOptimisticPrompt(local, {
    id: "item-1", sequence: 4, type: "message", text: "start now", created_at: new Date(1).toISOString(),
  }, [{ ...local, id: "item-1", sequence: 4 }]), null);
});

test("sidebar activity follows every daemon session, including paused turns", () => {
  const bindings = [
    { conversation_id: "conversation-1", daemon_session_id: "session-1", created_at: "now" },
    { conversation_id: "conversation-2", daemon_session_id: "session-2", created_at: "now" },
    { conversation_id: "conversation-3", daemon_session_id: "session-3", created_at: "now" },
  ];
  const sessions = [
    { id: "session-1", state: "running" as const, live: true, working: true, approval_policy: "auto" as const, created_at: "now" },
    { id: "session-2", state: "paused" as const, live: true, working: true, approval_policy: "auto" as const, created_at: "now" },
    { id: "session-3", state: "running" as const, live: true, working: false, approval_policy: "auto" as const, created_at: "now" },
  ];

  assert.deepEqual([...workingConversationIds(bindings, sessions)], ["conversation-1", "conversation-2"]);
  assert.deepEqual(
    [...workingConversationIds(bindings, sessions, { conversationId: "conversation-1", working: false })],
    ["conversation-2"],
  );
  assert.deepEqual(
    [...workingConversationIds(bindings, sessions, { conversationId: "conversation-3", working: true })],
    ["conversation-1", "conversation-2", "conversation-3"],
  );
});

test("selected timeline only overrides activity after that session's history loads", () => {
  assert.equal(selectedTimelineActivity({
    conversationId: "conversation-2",
    sessionId: "session-2",
    loadedSessionId: "session-1",
    sessionState: "running",
    loading: false,
    hasActiveTurn: false,
  }), undefined);
  assert.equal(selectedTimelineActivity({
    conversationId: "conversation-2",
    sessionId: "session-2",
    loadedSessionId: "session-2",
    sessionState: "running",
    loading: true,
    hasActiveTurn: false,
  }), undefined);
  assert.deepEqual(selectedTimelineActivity({
    conversationId: "conversation-2",
    sessionId: "session-2",
    loadedSessionId: "session-2",
    sessionState: "running",
    loading: false,
    hasActiveTurn: false,
  }), { conversationId: "conversation-2", working: false });
});

test("terminal and offline sessions cannot keep a stale turn active", () => {
  assert.equal(sessionAllowsActiveTurn("running"), true);
  assert.equal(sessionAllowsActiveTurn("starting"), true);
  assert.equal(sessionAllowsActiveTurn("paused"), true);
  assert.equal(sessionAllowsActiveTurn("failed"), false);
  assert.equal(sessionAllowsActiveTurn("ended"), false);
  assert.equal(sessionAllowsActiveTurn("offline"), false);
  assert.equal(sessionAllowsActiveTurn("created"), false);
});

test("resolved approvals collapse back into the ordinary tool timeline", () => {
  const toolCall = assistant("tool-call", 2, [
    { type: "tool_call", tool_call: { id: "call-1", name: "shell", arguments: "{}" } },
  ]);
  const request: DisplayItem = {
    id: "approval-request",
    sequence: 3,
    type: "approval_request",
    approval: { id: "approval-1", pending: [{ tool_call_id: "call-1" }] },
    created_at: new Date(0).toISOString(),
  };
  const approved: DisplayItem = {
    id: "approval-decision",
    sequence: 4,
    type: "approval_decision",
    approval: { id: "approval-1", decisions: [{ tool_call_id: "call-1", approved: true }] },
    created_at: new Date(0).toISOString(),
  };

  assert.deepEqual(visibleDisplayItems([toolCall, request]).map((item) => item.id), ["tool-call", "approval-request"]);
  assert.deepEqual(visibleDisplayItems([toolCall, request, approved]).map((item) => item.id), ["tool-call"]);
});

test("denied approvals keep only a compact decision marker", () => {
  const request: DisplayItem = {
    id: "approval-request",
    sequence: 2,
    type: "approval_request",
    approval: { id: "approval-1", pending: [{ tool_call_id: "call-1" }] },
    created_at: new Date(0).toISOString(),
  };
  const denied: DisplayItem = {
    id: "approval-decision",
    sequence: 3,
    type: "approval_decision",
    approval: { id: "approval-1", decisions: [{ tool_call_id: "call-1", approved: false }] },
    created_at: new Date(0).toISOString(),
  };

  assert.deepEqual(visibleDisplayItems([request, denied]).map((item) => item.id), ["approval-decision"]);
});

test("resolved questions replace their pending form with a compact marker", () => {
  const request: DisplayItem = {
    id: "question-request", sequence: 1, type: "interaction_request", created_at: "now",
    interaction: { id: "interaction-1", kind: "user_input", status: "pending", turn_id: "turn-1", questions: [{ id: "mode", question: "Choose" }] },
  };
  const response: DisplayItem = {
    id: "question-response", sequence: 2, type: "interaction_response", created_at: "now",
    interaction: { id: "interaction-1", kind: "user_input", status: "resolved", turn_id: "turn-1", answers: { mode: ["Safe"] } },
  };
  assert.deepEqual(visibleDisplayItems([request, response]).map((item) => item.id), ["question-response"]);
});

test("tool results pair across assistant items, across pause, but not across turns", () => {
  const call = assistant("call-item", 2, [
    { type: "tool_call", tool_call: { id: "call-1", name: "shell", arguments: "{}" } },
  ]);
  const result = assistant("result-item", 4, [
    { type: "tool_result", tool_result: { tool_call_id: "call-1", text: "ok" } },
  ]);
  const reusedResult = assistant("reused-result", 8, [
    { type: "tool_result", tool_result: { tool_call_id: "call-1", text: "wrong turn" } },
  ]);
  const projection = buildToolRenderProjection([
    turn("turn_started", 1),
    call,
    turn("turn_paused", 3),
    result,
    turn("turn_completed", 5),
    turn("turn_started", 6),
    reusedResult,
  ]);

  assert.equal(projection.resultsByCall.get(contentLocation(call.id, 0))?.text, "ok");
  assert.equal(projection.consumedResults.has(contentLocation(result.id, 0)), true);
  assert.equal(hasVisibleAssistantContent(result, projection), false);
  assert.equal(hasVisibleAssistantContent(call, projection), true);
  assert.equal(projection.consumedResults.has(contentLocation(reusedResult.id, 0)), false);
});

test("a generated image is visible assistant content", () => {
  const item = assistant("generated-image", 1, [{
    type: "image",
    image: {
      url: "/sessions/session-1/images/generated.png",
      media_type: "image/png",
      width: 1024,
      height: 1024,
    },
  }]);

  assert.equal(hasVisibleAssistantContent(item, buildToolRenderProjection([item])), true);
});

test("live tool progress attaches to its shell call and is removed by the final result", () => {
  const call = assistant("call-item", 2, [
    { type: "tool_call", tool_call: { id: "call-1", name: "shell", arguments: "{\"command\":\"go test ./...\"}" } },
  ]);
  const previews = appendDisplayDelta([], {
    item_id: "tool-progress:call-1",
    role: "assistant",
    part_type: "tool_progress",
    delta: "building...\n",
    tool_call_id: "call-1",
    tool_name: "shell",
  }, []);
  const projection = buildToolRenderProjection([turn("turn_started", 1), call, ...ephemeralDisplayItems(previews)]);
  assert.equal(projection.progressByCall.get("call-1"), "building...\n");
  assert.equal(latestPendingToolCall([turn("turn_started", 1), call], "shell")?.id, "call-1");

  const result = assistant("result-item", 3, [
    { type: "tool_result", tool_result: { tool_call_id: "call-1", tool_name: "shell", text: "ok" } },
  ]);
  assert.deepEqual(reconcileDisplayPreviews(previews, result), []);
  assert.equal(latestPendingToolCall([turn("turn_started", 1), call, result], "shell"), null);
});

test("historical and active consecutive tool calls form separate folded activity groups", () => {
  const items = [
    turn("turn_started", 1),
    assistant("call-1", 2, [{ type: "tool_call", tool_call: { id: "call-1", name: "read_file" } }]),
    assistant("result-1", 3, [{ type: "tool_result", tool_result: { tool_call_id: "call-1" } }]),
    assistant("reasoning-between", 3.5, [{ type: "reasoning", text: "next tool" }]),
    assistant("call-2", 4, [{ type: "tool_call", tool_call: { id: "call-2", name: "shell" } }]),
    assistant("result-2", 5, [{ type: "tool_result", tool_result: { tool_call_id: "call-2" } }]),
    turn("turn_started", 10),
    assistant("active-call-1", 11, [{ type: "tool_call", tool_call: { id: "active-1", name: "read_file" } }]),
    assistant("active-call-2", 12, [{ type: "tool_call", tool_call: { id: "active-2", name: "shell" } }]),
  ];
  const groups = groupTimelineItems(items, 10);
  assert.equal(groups[1]?.kind, "tools");
  assert.equal(groups[1]?.kind === "tools" ? groups[1].active : true, false);
  assert.deepEqual(groups[1]?.kind === "tools" ? groups[1].items.map((item) => item.id) : [], ["call-1", "result-1", "reasoning-between", "call-2", "result-2"]);
  assert.equal(groups[3]?.kind, "tools");
  assert.deepEqual(groups[3]?.kind === "tools" ? groups[3].items.map((item) => item.id) : [], ["active-call-1", "active-call-2"]);
  assert.equal(groups[3]?.kind === "tools" ? groups[3].active : false, true);
});

test("completed activity and the pending call share the open active group", () => {
  const items = [
    turn("turn_started", 10),
    assistant("active-call-1", 11, [{ type: "tool_call", tool_call: { id: "active-1", name: "read_file" } }]),
    assistant("active-result-1", 12, [{ type: "tool_result", tool_result: { tool_call_id: "active-1" } }]),
    assistant("active-reasoning", 13, [{ type: "reasoning", text: "continue" }]),
    assistant("active-call-2", 14, [{ type: "tool_call", tool_call: { id: "active-2", name: "shell" } }]),
    assistant("active-result-2", 15, [{ type: "tool_result", tool_result: { tool_call_id: "active-2" } }]),
    assistant("pending-call", 16, [{ type: "tool_call", tool_call: { id: "pending", name: "shell" } }]),
  ];
  const groups = groupTimelineItems(items, 10);
  assert.equal(groups[1]?.kind, "tools");
  assert.equal(groups[1]?.kind === "tools" ? groups[1].active : false, true);
  assert.deepEqual(groups[1]?.kind === "tools" ? groups[1].items.map((item) => item.id) : [], [
    "active-call-1",
    "active-result-1",
    "active-reasoning",
    "active-call-2",
    "active-result-2",
    "pending-call",
  ]);
});

test("the current activity group stays open until assistant text closes it", () => {
  const activeItems = [
    turn("turn_started", 10),
    assistant("active-reasoning", 11, [{ type: "reasoning", text: "inspect" }]),
    assistant("active-call", 12, [{ type: "tool_call", tool_call: { id: "active", name: "shell" } }]),
  ];
  const activeGroups = groupTimelineItems(activeItems, 10);
  assert.equal(activeGroups[1]?.kind, "tools");
  assert.equal(activeGroups[1]?.kind === "tools" ? activeGroups[1].active : false, true);

  const closedGroups = groupTimelineItems([
    ...activeItems,
    assistant("active-result", 13, [{ type: "tool_result", tool_result: { tool_call_id: "active" } }]),
    assistant("answer", 14, [{ type: "text", text: "done" }]),
  ], 10);
  assert.equal(closedGroups[1]?.kind, "tools");
  assert.equal(closedGroups[1]?.kind === "tools" ? closedGroups[1].active : true, false);
});

test("a pending approval keeps the preceding active tool group open", () => {
  const items: DisplayItem[] = [
    turn("turn_started", 10),
    assistant("completed-call", 11, [{ type: "tool_call", tool_call: { id: "call-1", name: "read_file" } }]),
    assistant("completed-result", 12, [{ type: "tool_result", tool_result: { tool_call_id: "call-1" } }]),
    assistant("pending-call", 13, [{ type: "tool_call", tool_call: { id: "call-2", name: "shell" } }]),
    {
      id: "approval-request",
      sequence: 14,
      type: "approval_request",
      approval: { id: "approval-1", pending: [{ tool_call_id: "call-2" }] },
      created_at: new Date(0).toISOString(),
    },
  ];

  const groups = groupTimelineItems(items, 10);
  assert.equal(groups[1]?.kind, "tools");
  assert.equal(groups[1]?.kind === "tools" ? groups[1].active : false, true);
  assert.deepEqual(groups[1]?.kind === "tools" ? groups[1].items.map((item) => item.id) : [], [
    "completed-call",
    "completed-result",
    "pending-call",
  ]);
  assert.equal(groups[2]?.kind, "item");
});

test("only unresolved human requests from the current open turn era are actionable", () => {
  const items: DisplayItem[] = [
    { ...turn("turn_started", 1), turn: { id: "old-turn" } },
    {
      id: "stale-approval", sequence: 2, type: "approval_request", created_at: "now",
      approval: { id: "approval-old", turn_id: "old-turn", pending: [{ tool_call_id: "old-call" }] },
    },
    { ...turn("turn_interrupted", 3), turn: { id: "old-turn" } },
    { ...turn("turn_started", 4), turn: { id: "root-turn" } },
    {
      id: "current-approval", sequence: 5, type: "approval_request", created_at: "now",
      approval: { id: "approval-current", turn_id: "child-turn", pending: [{ tool_call_id: "child-call" }] },
    },
    {
      id: "current-interaction", sequence: 6, type: "interaction_request", created_at: "now",
      interaction: { id: "interaction-current", kind: "user_input", status: "pending", turn_id: "other-child-turn", questions: [] },
    },
  ];

  const pending = pendingHumanRequestIDs(items);
  assert.deepEqual([...pending.approvals], ["approval-current"]);
  assert.deepEqual([...pending.interactions], ["interaction-current"]);

  const resolved = pendingHumanRequestIDs([...items, {
    id: "current-decision", sequence: 7, type: "approval_decision", created_at: "now",
    approval: { id: "approval-current", turn_id: "child-turn", decisions: [{ tool_call_id: "child-call", approved: false }] },
  }]);
  assert.deepEqual([...resolved.approvals], []);
  assert.deepEqual([...resolved.interactions], ["interaction-current"]);
});

test("consecutive reasoning items become one collapsed timeline group", () => {
  const groups = groupTimelineItems([
    assistant("reasoning-1", 1, [{ type: "reasoning", text: "first" }]),
    assistant("reasoning-2", 2, [{ type: "reasoning", text: "second" }]),
    assistant("answer", 3, [{ type: "text", text: "done" }]),
  ]);
  assert.equal(groups[0]?.kind, "reasoning");
  assert.deepEqual(groups[0]?.kind === "reasoning" ? groups[0].items.map((item) => item.id) : [], ["reasoning-1", "reasoning-2"]);
  assert.equal(groups[1]?.kind, "item");
});

test("reasoning nested in a historical tool group remains independently collapsible", () => {
  const groups = groupReasoningItems([
    assistant("call-1", 1, [{ type: "tool_call", tool_call: { id: "call-1", name: "read_file" } }]),
    assistant("reasoning-1", 2, [{ type: "reasoning", text: "first" }]),
    assistant("reasoning-2", 3, [{ type: "reasoning", text: "second" }]),
    assistant("call-2", 4, [{ type: "tool_call", tool_call: { id: "call-2", name: "shell" } }]),
  ]);
  assert.deepEqual(groups.map((group) => group.kind), ["item", "reasoning", "item"]);
  assert.deepEqual(groups[1]?.kind === "reasoning" ? groups[1].items.map((item) => item.id) : [], ["reasoning-1", "reasoning-2"]);
});

function delta(itemId: string, text: string) {
  return { item_id: itemId, role: "assistant" as const, part_type: "text" as const, delta: text };
}

function assistant(id: string, sequence: number, content: NonNullable<DisplayItem["content"]>): DisplayItem {
  return { id, sequence, type: "assistant_message", role: "assistant", content, created_at: new Date(0).toISOString() };
}

function turn(type: "turn_started" | "turn_paused" | "turn_completed" | "turn_interrupted", sequence: number): DisplayItem {
  return { id: `${type}-${sequence}`, sequence, type, created_at: new Date(0).toISOString() };
}
