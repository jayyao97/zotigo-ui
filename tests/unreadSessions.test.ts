import assert from "node:assert/strict";
import test from "node:test";
import { canAcknowledgeSession, conversationIsVisible, mergeReadState } from "../src/unreadSessions";
import { JSDOM } from "jsdom";

const unread = { version: 2, read_version: 1, completed_sequence: 100, unread: true };
test("only acknowledges a visible, loaded completion", () => {
  assert.equal(canAcknowledgeSession(unread, 99, true), false);
  assert.equal(canAcknowledgeSession(unread, 100, false), false);
  assert.equal(canAcknowledgeSession(unread, 100, true), true);
  assert.equal(canAcknowledgeSession(undefined, 100, true), false);
});
test("stale polls cannot undo read acknowledgements or manual unread", () => {
  const read = { ...unread, read_version: 2, unread: false };
  assert.deepEqual(mergeReadState(read, unread), read);
  const manual = { ...read, version: 3, unread: true };
  assert.deepEqual(mergeReadState(manual, read), manual);
  assert.deepEqual(mergeReadState(read, manual), manual);
  assert.deepEqual(mergeReadState(manual, undefined), manual);
});

test("covered conversation is not read, and becomes readable after returning", () => {
  const dom = new JSDOM('<section><div id="conversation"></div></section>');
  try {
    const conversation = dom.window.document.getElementById('conversation')!;
    let hasLayout = true;
    conversation.getClientRects = () => (hasLayout ? [new dom.window.DOMRect(0, 0, 400, 600)] : []) as unknown as DOMRectList;
    const readable = () => canAcknowledgeSession(unread, 100, conversationIsVisible(conversation));
    assert.equal(readable(), true);
    conversation.parentElement!.style.visibility = 'hidden';
    assert.equal(readable(), false, 'expanded desktop panel hides the conversation');
    conversation.parentElement!.style.visibility = 'visible';
    hasLayout = false;
    assert.equal(readable(), false, 'mobile fullscreen panel removes conversation layout');
    hasLayout = true;
    assert.equal(readable(), true, 'returning to conversation permits acknowledgement');
  } finally { dom.window.close(); }
});
