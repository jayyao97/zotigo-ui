import { test } from "node:test";
import assert from "node:assert/strict";
import { DaemonClient, ApiError } from "../src/core/client";
import {
  ComposerStore,
  emptyDraft,
  prepareAttachments,
  submissionAttempt,
  type ComposerState,
} from "../src/core/composer";
import { validateAttachments, attachmentPrompt } from "../src/core/attachments";
import { localSearch, mergeHits } from "../src/core/conversationSearch";
import type { Storage } from "../src/core/hosts";
import type { DisplayItem } from "@zotigo/shared/zotigod";
const host = {
  id: "home",
  name: "Home",
  baseUrl: "https://home.test",
  token: "home-secret",
};
function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => {
      values.set(k, v);
    },
    remove: async (k) => {
      values.delete(k);
    },
  };
}
const file = (name: string) => ({ name, data_base64: btoa("hello") });
test("queue attempts retain their mode, payload and ID across restart and settings changes", async () => {
  const draft = { ...emptyDraft(), text: "next turn" };
  const attempt = submissionAttempt({ draft }, "stable-id", false, "queue");
  const store = new ComposerStore(memory(), "home", "s");
  await store.write({ draft, attempt });
  const restored = await store.read();
  assert.deepEqual(submissionAttempt(restored, "other-id", true), attempt);
  const requests: string[] = [];
  const client = new DaemonClient(host, async (url, init) => {
    requests.push(url);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer home-secret",
    );
    assert.equal(JSON.parse(String(init?.body)).client_message_id, "stable-id");
    return Response.json({ code: "ok", data: {} });
  });
  await client.send("s/1", attempt, attempt.mode);
  assert.deepEqual(requests, ["https://home.test/sessions/s%2F1/queue"]);
});
test("queue edits preserve revision conflicts and never automatically repeat a mutation", async () => {
  let requests = 0;
  const client = new DaemonClient(host, async (_, init) => {
    requests++;
    assert.equal(init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      revision: 7,
      text: "edited",
    });
    return Response.json(
      { code: "conflict", message: "changed elsewhere" },
      { status: 409 },
    );
  });
  await assert.rejects(
    client.changeQueuedInput("s", "q", 7, "edited"),
    (e) => e instanceof ApiError && e.status === 409,
  );
  assert.equal(requests, 1);
  const unsupported = new DaemonClient(host, async () =>
    Response.json({ code: "missing" }, { status: 404 }),
  );
  assert.equal(await unsupported.queuedInputs("s"), null);
});
test("attachment retries retain successfully uploaded paths and freeze unknown sends", async () => {
  const storage = memory(),
    store = new ComposerStore(storage, "home", "s");
  const current = {
    current: {
      draft: { ...emptyDraft(), files: [file("one.txt"), file("two.txt")] },
    } as ComposerState,
  };
  const uploads: string[] = [];
  let fail = true;
  const client = new DaemonClient(host, async (url, init) => {
    const name = new URL(url).searchParams.get("name")!;
    uploads.push(name);
    assert.equal(
      new Headers(init?.headers).get("Content-Type"),
      "application/octet-stream",
    );
    assert.equal(new TextDecoder().decode(init?.body as ArrayBuffer), "hello");
    if (name === "two.txt" && fail) throw new Error("offline");
    return Response.json({ code: "ok", data: { path: "/uploads/" + name } });
  });
  await assert.rejects(
    prepareAttachments(client, "s", current, store, () => {}),
    /offline/,
  );
  current.current = await store.read();
  assert.equal(current.current.draft.files?.[0].path, "/uploads/one.txt");
  fail = false;
  await prepareAttachments(client, "s", current, store, () => {});
  assert.deepEqual(uploads, ["one.txt", "two.txt", "two.txt"]);
  const attempt = submissionAttempt(current.current, "request", false);
  assert.match(attempt.text, /\[one.txt\]\(<\/uploads\/one.txt>\)/);
  current.current.attempt = attempt;
  await prepareAttachments(client, "s", current, store, () => {});
  assert.equal(uploads.length, 3);
  assert.equal(
    (await new ComposerStore(storage, "other-host", "s").read()).draft.files,
    undefined,
  );
});
test("combined attachment limits apply before upload and unuploaded files cannot be sent", () => {
  assert.throws(
    () =>
      validateAttachments(
        [{ mime_type: "image/png", data_base64: btoa("x") }],
        Array.from({ length: 5 }, (_, i) => file(`${i}.txt`)),
      ),
    /5 attachments/,
  );
  assert.throws(() => attachmentPrompt("hello", [file("x.txt")]), /Upload/);
  assert.throws(
    () =>
      validateAttachments(
        [],
        [{ ...file("x.txt"), path: "https://external.test" }],
      ),
    /Invalid saved/,
  );
});
test("only present inline skills are sent, deletion and undo keep the intended skill payload", () => {
  const draft = {
    ...emptyDraft(),
    text: "Review [$testing] now",
    skills: ["testing", "removed"],
  };
  const attempt = submissionAttempt({ draft }, "id", false);
  assert.deepEqual(attempt.skills, ["testing"]);
  assert.equal(attempt.text, "Review $testing now");
  assert.deepEqual(
    submissionAttempt({ draft: { ...draft, text: "Review now" } }, "id", false)
      .skills,
    [],
  );
  assert.deepEqual(submissionAttempt({ draft }, "id", false).skills, [
    "testing",
  ]);
});
test("legacy skill drafts migrate into inline tokens without rewriting uncertain attempts", async () => {
  const store = new ComposerStore(memory(), "home", "s");
  const draft = { text: "Check", skills: ["testing"], images: [] };
  await store.write({ draft });
  assert.equal((await store.read()).draft.text, "[$testing] Check");
  const attempt = submissionAttempt({ draft }, "id", true);
  await store.write({ draft, attempt });
  assert.deepEqual(await store.read(), { draft, attempt });
});
test("history search merges remote-only hits without mutating the live items or cursor", async () => {
  const items: DisplayItem[] = [
    {
      id: "loaded",
      sequence: 10,
      type: "assistant_message",
      created_at: "",
      content: [{ type: "text", text: "Hello world" }],
    },
  ];
  const before = JSON.stringify(items);
  assert.deepEqual(
    mergeHits(localSearch(items, "HELLO"), [
      { id: "old", sequence: 1 },
      { id: "loaded", sequence: 10 },
    ]),
    [
      { id: "loaded", sequence: 10 },
      { id: "old", sequence: 1 },
    ],
  );
  const urls: string[] = [];
  const client = new DaemonClient(host, async (url) => {
    urls.push(url);
    return Response.json({
      code: "ok",
      data: { items: [], hits: [], truncated: false },
    });
  });
  await client.search("s", "hello & world");
  await client.itemWindow("s", "old/1");
  assert.match(urls[0], /q=hello%20%26%20world$/);
  assert.match(urls[1], /message_id=old%2F1$/);
  assert.equal(JSON.stringify(items), before);
});

test("automatic titles protect a manual rename while suggestion is in flight", async () => {
  const { isPlaceholderTitle, suggestConversationTitle } = await import(
    "../src/core/conversationTitle"
  );
  assert.equal(isPlaceholderTitle("My manual title", "First prompt"), false);
  assert.equal(isPlaceholderTitle("First prompt", "First prompt"), true);
  let currentTitle = "My manual title";
  let renamed = 0;
  const client = new DaemonClient(host, async (url, init) => {
    if (url.endsWith("/title-suggestion"))
      return Response.json({ code: "ok", data: { title: "Suggested title" } });
    if (url.endsWith("/catalog/sessions"))
      return Response.json({
        code: "ok",
        data: {
          sessions: [
            { organization: { session_id: "s", title: currentTitle } },
          ],
        },
      });
    assert.equal(JSON.parse(String(init?.body)).title, "Suggested title");
    renamed++;
    return Response.json({ code: "ok", data: {} });
  });
  assert.equal(
    await suggestConversationTitle(client, "s", "First prompt", () => true),
    undefined,
  );
  assert.equal(renamed, 0);
  currentTitle = "First prompt";
  assert.equal(
    await suggestConversationTitle(client, "s", currentTitle, () => false),
    undefined,
  );
  assert.equal(renamed, 0);
  assert.equal(
    await suggestConversationTitle(client, "s", currentTitle, () => true),
    "Suggested title",
  );
  assert.equal(renamed, 1);
});

test("history highlighting treats code punctuation literally and matches across syntax tokens", async () => {
  const { highlightParts } = await import("../src/core/conversationSearch");
  assert.deepEqual(
    highlightParts("const x = fn(a + b); // fn(A + B)", "fn(a + b)"),
    [
      { text: "const x = ", matched: false },
      { text: "fn(a + b)", matched: true },
      { text: "; // ", matched: false },
      { text: "fn(A + B)", matched: true },
      { text: "", matched: false },
    ],
  );
  assert.deepEqual(highlightParts("const x = 1"), [
    { text: "const x = 1", matched: false },
  ]);
});
