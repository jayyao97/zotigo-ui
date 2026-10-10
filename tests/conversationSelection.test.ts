import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { selectedMessageRange, textRanges } from "../src/conversation/selectionText";
import { referencePrompt } from "../shared/conversationReferences";
import { emptyComposerDraft, restoreSubmittedDraft, updateComposerDrafts } from "../src/composerDrafts";
import { avoidAnnotationMarkers } from "../src/conversation/ConversationAnnotations";

test("paragraph selection accepts a trailing message boundary but rejects selected text in another message", () => {
  const dom = new JSDOM('<main><div data-message-id="one"><p>Alpha <b>bravo</b>.</p></div>\n<div data-message-id="two"><p>Second message.</p></div></main>');
  try {
    const root = dom.window.document.querySelector('main')!;
    const first = root.querySelector('[data-message-id="one"]') as HTMLElement;
    const second = root.querySelector('[data-message-id="two"] p')!;
    const selected = dom.window.document.createRange();
    selected.setStart(first.querySelector('p')!.firstChild!, 0);
    for (const endpoint of [second, second.firstChild!, root]) {
      selected.setEnd(endpoint, endpoint === root ? 2 : 0);
      const match = selectedMessageRange(selected, root)!;
      assert.equal(match.message, first);
      assert.equal(match.range.toString(), 'Alpha bravo.');
      assert.equal(match.range.endContainer, first);
      assert.equal(selected.endContainer, endpoint, 'must not modify native selection');
    }
    selected.setEnd(second.firstChild!, 1);
    assert.equal(selectedMessageRange(selected, root), null);
    selected.selectNodeContents(first.querySelector('b')!);
    assert.equal(selectedMessageRange(selected, root)?.range.toString(), 'bravo');
    assert.equal(selectedMessageRange(selected, second as HTMLElement), null);
  } finally { dom.window.close(); }
});

test("comment popup rises only when it overlaps an annotation marker", () => {
  const dom = new JSDOM();
  const size = { width: 340, height: 120 };
  const position = { left: 100, top: 200 };
  const marker = (x: number, y: number) => new dom.window.DOMRect(x, y, 26, 26);
  assert.deepEqual(avoidAnnotationMarkers(position, size, [marker(470, 300)], 8), position);
  assert.deepEqual(avoidAnnotationMarkers(position, size, [marker(400, 350)], 8), position);
  assert.deepEqual(avoidAnnotationMarkers(position, size, [marker(400, 300)], 8), { left: 100, top: 172 });
  assert.deepEqual(avoidAnnotationMarkers(position, size, [marker(400, 300), marker(400, 160)], 8), { left: 100, top: 32 });
  dom.window.close();
});

test("conversation find matches inline Markdown and literal punctuation with original Unicode offsets", () => {
  const dom = new JSDOM('<div id="message">Hello <strong>world</strong> (a+b) 中文İ test<button>Ran shell</button><span aria-hidden="true">hidden</span></div>');
  const previous = { document: globalThis.document, NodeFilter: globalThis.NodeFilter };
  Object.assign(globalThis, { document: dom.window.document, NodeFilter: dom.window.NodeFilter });
  try {
    const root = dom.window.document.getElementById("message")!;
    assert.equal(textRanges(root, "hello world")[0].toString(), "Hello world");
    assert.equal(textRanges(root, "(a+b)")[0].toString(), "(a+b)");
    assert.equal(textRanges(root, "test")[0].toString(), "test");
    assert.equal(textRanges(root, "hidden").length, 0);
    assert.equal(textRanges(root, "Ran shell")[0].toString(), "Ran shell");
    assert.equal(textRanges(root, "").length, 0);
    assert.equal(textRanges(root, "l", 2).length, 2);
    assert.equal(textRanges(root, "l", 0).length, 0);
  } finally { Object.assign(globalThis, previous); dom.window.close(); }
});

test("references preserve the quote, source and optional comment on send and retry", () => {
  const ref = { id: "r1", messageId: "msg-1", text: "line one\nline two", comment: "Explain this" };
  assert.equal(referencePrompt("Please check", [ref]), "[Reference 1](#message-msg-1):\n\n> line one\n> line two\n\nComment: Explain this\n\nPlease check");
  assert.equal(referencePrompt("hello"), "hello");
  const draft = { ...emptyComposerDraft<{ id: string }>(), references: [ref] };
  const drafts = updateComposerDrafts({}, "session:1", () => draft);
  assert.equal(drafts["session:1"].references?.length, 1);
  const restored = restoreSubmittedDraft(draft, draft);
  assert.equal(restored.references?.length, 1);
  assert.deepEqual(updateComposerDrafts(drafts, "session:1", () => emptyComposerDraft()), {});
});

test("annotation offsets identify repeated text across markup and fail closed after source changes", async () => {
  const { annotationRange, selectionOffset } = await import("../src/conversation/annotationRange");
  const dom = new JSDOM('<div id="m">Same text. Same <b>text.</b></div>');
  const previous = globalThis.NodeFilter;
  globalThis.NodeFilter = dom.window.NodeFilter;
  try {
    const message = dom.window.document.getElementById("m")!;
    const selected = dom.window.document.createRange();
    selected.setStart(message.firstChild!, 11);
    selected.setEnd(message.lastChild!.firstChild!, 5);
    const reference = { id: "r", messageId: "m", text: selected.toString(), comment: "", startOffset: selectionOffset(message, selected) };
    assert.equal(reference.startOffset, 11);
    const restored = annotationRange(message, reference)!;
    assert.equal(restored.toString(), "Same text.");
    assert.equal(restored.startOffset, 11);
    message.firstChild!.textContent = "Changed text. Same ";
    assert.equal(annotationRange(message, reference), null);
  } finally { globalThis.NodeFilter = previous; dom.window.close(); }
});


test("message search excludes tool/reasoning payloads and merges live and persisted hits by identity", async () => {
  const { searchLoadedMessages, mergeSearchHits } = await import("../src/conversation/ConversationFind");
  const items = [
    { id: "tool", created_at: "2026-10-10T00:00:00Z", sequence: 1, type: "assistant_message" as const, content: [{ type: "tool_result" as const, tool_result: { text: "中文" } }] },
    { id: "thought", created_at: "2026-10-10T00:00:00Z", sequence: 2, type: "assistant_message" as const, content: [{ type: "reasoning" as const, text: "中文" }] },
    { id: "live", created_at: "2026-10-10T00:00:00Z", sequence: 3, type: "assistant_message" as const, content: [{ type: "text" as const, text: "CAFÉ 中文 100%" }] },
  ];
  assert.deepEqual(searchLoadedMessages(items, "café"), [{ id: "live", sequence: 3 }]);
  assert.equal(searchLoadedMessages(items, "中文").length, 1);
  assert.equal(searchLoadedMessages(items, "100%").length, 1);
  assert.deepEqual(mergeSearchHits(searchLoadedMessages(items, "中文"), [{ id: "live", sequence: 3 }, { id: "old", sequence: 1 }]), [{ id: "live", sequence: 3 }, { id: "old", sequence: 1 }]);
});
