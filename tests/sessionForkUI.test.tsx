import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionTimeline } from "../src/conversation/ConversationTimeline";
import type { DisplayItem } from "../shared/zotigod";

test("timeline renders persistent current and hover historical fork actions with active disabled", (t) => {
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
  const html = renderToStaticMarkup(<SessionTimeline
    binding={{ conversation_id: "s", daemon_session_id: "s", created_at: "2026-01-01T00:00:00Z" }}
    session={{ id: "s", state: "running", live: true, working: true, created_at: "2026-01-01T00:00:00Z" }}
    items={items} itemsAuthoritative itemsLoading={false} itemsError={null} message={null} daemonUrl="http://127.0.0.1:18766"
    streamingItemIds={new Set()} smoothStreaming={false} submittingApprovalIds={new Set()} onSubmitApproval={async () => {}}
    submittingInteractionIds={new Set()} onSubmitInteraction={async () => {}} onFork={() => {}}
  />);
  assert.equal((html.match(/aria-label="Fork from this turn"/g) ?? []).length, 2);
  assert.match(html, /turn-response is-latest/);
  assert.match(html, /Fork is available after this turn completes" disabled/);
  assert.match(html, /title="Fork from this turn"/);
});
