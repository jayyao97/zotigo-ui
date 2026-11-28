import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { PendingInteractionNotice } from "../src/conversation/PendingInteractionNotice";
import { SessionTimeline, UserInputItem } from "../src/conversation/ConversationTimeline";
import { hasUnresolvedTurnItems, visibleDisplayItems } from "../shared/sessionDisplay";
import type { DisplayItem } from "../shared/zotigod";

const turn: DisplayItem = { id: "turn", sequence: 1, type: "turn_started", turn: { id: "turn" }, created_at: "now" };
function question(id: string, blocking = false): DisplayItem {
  return { id, sequence: blocking ? 3 : 2, type: "interaction_request", turn: { id: "turn" }, created_at: "now",
    interaction: { id, turn_id: "turn", kind: "user_input", status: "pending", is_blocking: blocking,
      questions: [{ id: "q", question: "Which approach?", options: [{ label: "A" }, { label: "B" }] }] } };
}

test("pending notice distinguishes blocking questions and disappears on response or turn end", () => {
  const request = question("request");
  const render = (items: DisplayItem[]) => renderToStaticMarkup(<PendingInteractionNotice items={items} onOpen={() => {}} />);
  assert.match(render([turn, request]), /You can answer while work continues/);
  assert.match(render([turn, request]), /1 pending question request</);
  assert.match(render([turn, request, question("blocking", true)]), /Waiting for your answer/);
  assert.match(render([turn, request, question("blocking", true)]), /2 pending question requests/);
  assert.equal(render([]), "");
  assert.equal(render([turn, request, { ...request, id: "response", sequence: 4, type: "interaction_response" }]), "");
  assert.equal(render([turn, request, { ...turn, id: "end", sequence: 5, type: "turn_completed" }]), "");
});

test("closed questions keep their summary without an editable form or a false timeout claim", () => {
  const request = question("request");
  for (const status of ["resolved", "expired"] as const) {
    const response: DisplayItem = { ...request, id: "response", sequence: 3, type: "interaction_response", interaction: { ...request.interaction!, status } };
    const visible = visibleDisplayItems([turn, request, response]);
    assert.ok(!visible.includes(request));
    assert.ok(visible.includes(response));
    const html = renderToStaticMarkup(<UserInputItem item={response} pending={false} submitting={false} onSubmit={async () => {}} />);
    assert.match(html, /Which approach\?/);
    assert.match(html, status === "resolved" ? /Answered question/ : /Question closed/);
    assert.doesNotMatch(html, /<form|<input|expired|timeout/i);
  }
  assert.match(renderToStaticMarkup(<UserInputItem item={request} pending={false} submitting={false} onSubmit={async () => {}} />), /Question closed/);
});

test("notice opens the blocking request and answers still require an explicit submission", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  const opened: string[] = [];
  const submitted: unknown[] = [];
  const request = question("blocking", true);
  try {
    await act(async () => root.render(<>
      <PendingInteractionNotice items={[turn, question("optional"), request]} onOpen={id => opened.push(id)} />
      <UserInputItem item={request} pending submitting={false} onSubmit={async (id, answers) => { submitted.push({ id, answers }); }} />
    </>));
    assert.equal(document.querySelector('input:checked'), null);
    await act(async () => document.querySelector<HTMLButtonElement>('.pending-interaction-notice button')!.click());
    assert.deepEqual(opened, ["blocking"]);
    await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
    assert.equal(submitted.length, 0);
    await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    assert.deepEqual(submitted, [{ id: "blocking", answers: { q: ["A"] } }]);
    await act(async () => root.render(<UserInputItem item={request} pending submitting onSubmit={async () => {}} />));
    assert.equal(document.querySelector<HTMLFieldSetElement>('fieldset')!.disabled, true);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) {
      if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});


test("search windows use authoritative interaction history and incomplete history stays unknown", () => {
  const request = question("request", true);
  const render = (history: DisplayItem[]) => renderToStaticMarkup(<SessionTimeline
    binding={{ conversation_id: "s", daemon_session_id: "s", created_at: "now" }}
    session={{ id: "s", state: "paused", live: true, working: false, created_at: "now" }}
    items={[request]} interactionHistory={history} itemsAuthoritative itemsLoading={false}
    itemsError={null} message={null} daemonUrl="http://localhost"
    streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()}
    onSubmitApproval={async () => {}} submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}}
  />);
  const active = render([turn, request]);
  assert.match(active, /Waiting for your answer/);
  assert.match(active, /Submit answer/);
  assert.doesNotMatch(active, /Question closed|fieldset disabled/);
  const unknown = render([request]);
  assert.match(unknown, /Question status is not available yet/);
  assert.match(unknown, /Which approach/);
  assert.match(unknown, /fieldset disabled/);
  assert.doesNotMatch(unknown, /Question closed|Submit answer/);
  const ended = render([turn, request, { ...turn, id: "end", sequence: 5, type: "turn_completed" }]);
  assert.match(ended, /Question closed/);
  assert.doesNotMatch(ended, /<form/);
});

test("async questions close with their own turn and keep searchable history", (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const request = question("card");
  request.interaction = { ...request.interaction!, reply_as_message: true, item_id: "call" };
  const fallback: DisplayItem = { id: "call", sequence: 2, type: "assistant_message", created_at: "now", content: [{ type: "text", text: "Question Markdown" }] };
  const history = [turn, fallback, request];
  const notice = (items: DisplayItem[]) => renderToStaticMarkup(<PendingInteractionNotice items={items} onOpen={() => {}} />);
  const render = (items: DisplayItem[], window = items, searchTarget?: string | number) => renderToStaticMarkup(<SessionTimeline binding={{conversation_id:"s",daemon_session_id:"s",created_at:"now"}}
    session={{id:"s",state:"running",live:true,working:true,created_at:"now"}} items={window} searchTarget={searchTarget} interactionHistory={items} itemsAuthoritative
    itemsLoading={false} itemsError={null} message={null} daemonUrl="" streamingItemIds={new Set()} smoothStreaming={false}
    submittingApprovalIds={new Set()} submittingInteractionIds={new Set()} onSubmitApproval={async()=>{}} onSubmitInteraction={async()=>{}} />);
  assert.match(render(history), /Submit answer/);
  assert.match(notice(history), /1 pending question/);
  assert.doesNotMatch(render(history), /Question Markdown/);
  assert.match(render(history, history, fallback.id), /data-message-id="call"/);
  for (const type of ["turn_completed", "turn_interrupted", "turn_failed"] as const) {
    const ended = [...history, {...turn, type, id:"end", sequence:4}];
    assert.equal(notice(ended), "");
    assert.doesNotMatch(render(ended), /Question Markdown/);
    assert.doesNotMatch(render(ended), /Submit answer|input type="radio"/);
    assert.doesNotMatch(render(ended, [request]), /Submit answer|Which approach/);
    const answer: DisplayItem = { ...request, id:"reply", sequence:5, type:"interaction_response", interaction:{...request.interaction,status:"resolved"} };
    assert.match(render([...ended, answer]), /Answered question/);
    assert.doesNotMatch(render([...ended, answer]), /Question Markdown/);
    assert.match(render([...ended, answer], [...ended, answer], fallback.sequence), /data-message-id="call"/);
    const searched = render(ended, ended, fallback.id);
    assert.match(searched, /Question Markdown/);
    assert.doesNotMatch(searched, /Submit answer|input type="radio"/);
  }
  const raw = { ...fallback, followup_question_id: "card" };
  assert.deepEqual(visibleDisplayItems([raw]), []);
  assert.doesNotMatch(render(history, [raw]), /Question Markdown/);
  const newTurn = {...turn, sequence:5, turn:{id:"other"}};
  assert.equal(notice([newTurn, request]), "");
  assert.equal(hasUnresolvedTurnItems([request]), true);
  assert.equal(hasUnresolvedTurnItems([newTurn, request]), false);
});
