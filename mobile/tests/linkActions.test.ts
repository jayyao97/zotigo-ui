import { test } from "node:test";
import assert from "node:assert/strict";
import { getLocale, setLocale } from "@zotigo/shared/i18n/index";
import { linkActions } from "../src/core/linkActions";

test("a tap opens a link, asking first only before leaving the app", () => {
  const previous = getLocale();
  try {
    setLocale("en");
    const web = linkActions("https://example.com/docs", false);
    assert.ok(web.prompt);
    assert.equal(web.title, "Open external link?");
    assert.deepEqual(web.actions, ["open", "copy", "cancel"]);
    assert.equal(web.copy, "https://example.com/docs");
    assert.deepEqual(linkActions("src/client.ts", false), { prompt: false });
    assert.deepEqual(linkActions("#message-abc", false), { prompt: false });
  } finally {
    setLocale(previous);
  }
});

test("a long press offers Open and Copy, copying a file link's readable path", () => {
  const file = linkActions("notes/My%20Plan.md#L12", true);
  assert.ok(file.prompt);
  assert.deepEqual(file.actions, ["open", "copy", "cancel"]);
  assert.equal(file.copy, "notes/My Plan.md:12");
  assert.equal(file.message, "notes/My Plan.md:12");
  // Nothing to copy for an in-page anchor: a long press does nothing.
  assert.deepEqual(linkActions("#message-abc", true), { prompt: false, ignore: true });
  assert.throws(() => linkActions("javascript:alert(1)", true));
});
