import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionTimeline } from "../src/conversation/ConversationTimeline";
import type { DisplayItem } from "../shared/zotigod";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

test("timeline puts actions under completed answers and hides them on active progress", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const items: DisplayItem[] = [
    { id: "1", sequence: 1, type: "turn_started", turn: { id: "a" }, created_at: "2026-01-01T00:00:00Z" },
    { id: "2", sequence: 2, type: "assistant_message", content: [{ type: "text", text: "Done" }], created_at: "2026-01-01T00:00:00Z" },
    { id: "3", sequence: 3, type: "turn_completed", turn: { id: "a" }, created_at: "2026-01-01T00:00:01Z" },
    { id: "4", sequence: 4, type: "turn_started", turn: { id: "b" }, created_at: "2026-01-01T00:00:02Z" },
    { id: "5", sequence: 5, type: "assistant_message", content: [{ type: "text", text: "Working" }], created_at: "2026-01-01T00:00:02Z" },
  ];
  const render = (items: DisplayItem[]) => renderToStaticMarkup(<SessionTimeline
    binding={{ conversation_id: "s", daemon_session_id: "s", created_at: "2026-01-01T00:00:00Z" }}
    session={{ id: "s", state: "running", live: true, working: true, created_at: "2026-01-01T00:00:00Z" }}
    items={items} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://127.0.0.1:18766"
    streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
    submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}} onFork={() => {}}
  />);
  const html = render(items);
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelectorAll(".turn-actions").length, 1);
  assert.match(dom.window.document.querySelector(".turn-response")!.textContent!, /Done/);
  assert.doesNotMatch(dom.window.document.querySelector(".turn-response")!.textContent!, /Working/);
  dom.window.close();
  assert.doesNotMatch(render(items.slice(3)), /turn-actions/);
  assert.doesNotMatch(render(items.slice(3, 4)), /turn-actions/);
  assert.match(render(items.slice(0, 3)), /turn-response is-latest/);
  assert.match(html, /title="Fork from this turn"/);
});

test("fork lineage shows the source title and opens it with a single click", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false }) });
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const root = createRoot(document.getElementById("root")!);
  const opened: string[] = [];
  const render = async (title?: string, available = true) => {
    await act(async () => root.render(<SessionTimeline
      binding={{ conversation_id: "fork", daemon_session_id: "fork", created_at: "2026-01-01T00:00:00Z" }}
      session={{ id: "fork", state: "ended", live: false, working: false, created_at: "2026-01-01T00:00:00Z", forked_from: { session_id: "source", through_turn_id: "turn-a" } }}
      items={[]} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://127.0.0.1:18766"
      streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
      submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}}
      forkSourceTitle={title} onOpenForkSource={available ? (id) => opened.push(id) : undefined}
    />));
  };
  try {
    await render("Original conversation");
    const button = document.querySelector<HTMLButtonElement>(".fork-lineage button")!;
    assert.equal(button.textContent, "Forked from Original conversation");
    assert.match(button.title, /source · turn-a/);
    await act(async () => button.click());
    assert.deepEqual(opened, ["source"]);
    await render("Renamed conversation");
    assert.equal(button.textContent, "Forked from Renamed conversation");
    await render(undefined, false);
    assert.equal(button.textContent, "Forked from source");
    assert.equal(button.disabled, true);
    assert.match(button.title, /unavailable/);
    await act(async () => button.click());
    assert.deepEqual(opened, ["source"]);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});


test("timeline shows durable turn failures once, including after a later successful turn", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const render = (items: DisplayItem[]) => renderToStaticMarkup(<SessionTimeline
    binding={{ conversation_id: "s", daemon_session_id: "s", created_at: "2026-01-01T00:00:00Z" }}
    session={{ id: "s", state: "ended", live: false, working: false, created_at: "2026-01-01T00:00:00Z" }}
    items={items} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://127.0.0.1:18766"
    streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
    submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}} onFork={() => {}}
  />);

  const failed: DisplayItem = {
    id: "failed", sequence: 2, type: "turn_failed", turn: { id: "a", status: "failed" },
    error: "Selected model is at capacity. Please try a different model.", created_at: "2026-01-01T00:00:01Z",
  };
  const items: DisplayItem[] = [
    { id: "start", sequence: 1, type: "turn_started", turn: { id: "a" }, created_at: "2026-01-01T00:00:00Z" },
    failed, { ...failed, id: "replay", sequence: 3 },
    { id: "retry", sequence: 4, type: "turn_started", turn: { id: "b" }, created_at: "2026-01-01T00:00:02Z" },
    { id: "done", sequence: 5, type: "turn_completed", turn: { id: "b" }, created_at: "2026-01-01T00:00:03Z" },
  ];
  const dom = new JSDOM(render(items));
  assert.equal(dom.window.document.querySelectorAll(".display-error").length, 1);
  assert.equal(dom.window.document.querySelector(".display-error p")?.textContent, failed.error);
  dom.window.close();
  assert.match(render([{ ...failed, error: undefined }]), /This turn failed. Please try again./);
});
