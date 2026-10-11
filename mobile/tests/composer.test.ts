import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ComposerStore,
  emptyDraft,
  submissionAttempt,
  type ComposerState,
} from "../src/core/composer";
import { DaemonClient } from "../src/core/client";
import type { Storage } from "../src/core/hosts";
test("new submission repairs legacy draft image MIME but uncertain retry stays byte-for-byte identical", () => {
  const image = {
    mime_type: "image/png",
    data_base64: Buffer.from([255, 216, 255, 224, 0, 16]).toString("base64"),
  };
  const draft = { ...emptyDraft(), images: [image] };
  assert.equal(
    submissionAttempt({ draft }, "new-id", false).images[0].mime_type,
    "image/jpeg",
  );
  const attempt = { ...draft, client_message_id: "original-id", steer: true };
  const before = JSON.stringify(attempt);
  assert.equal(
    submissionAttempt({ draft, attempt }, "must-not-replace", false),
    attempt,
  );
  assert.equal(JSON.stringify(attempt), before);
});
test("uncertain submission survives restart with identical payload/id and stays host-scoped", async () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => {
      values.set(k, v);
    },
    remove: async (k) => {
      values.delete(k);
    },
  };
  const store = new ComposerStore(storage, "home", "same-session-id");
  const other = new ComposerStore(storage, "work", "same-session-id");
  const state: ComposerState = {
    draft: { ...emptyDraft(), text: "hello" },
    attempt: {
      ...emptyDraft(),
      text: "hello",
      client_message_id: "unique",
      steer: false,
    },
  };
  await store.write(state);
  const restored = await new ComposerStore(
    storage,
    "home",
    "same-session-id",
  ).read();
  assert.deepEqual(restored, state);
  assert.equal((await other.read()).attempt, undefined);
  const payloads: string[] = [];
  let calls = 0;
  const client = new DaemonClient(
    { id: "home", name: "home", baseUrl: "https://home.test", token: "" },
    async (_, init) => {
      payloads.push(String(init?.body));
      if (!calls++) throw new Error("network timeout");
      return Response.json({ code: "ok", data: { id: "accepted" } });
    },
  );
  await assert.rejects(client.send("same-session-id", restored.attempt!));
  await client.send("same-session-id", restored.attempt!);
  assert.equal(payloads[0], payloads[1]);
  await store.write({ draft: emptyDraft() });
  assert.equal((await store.read()).attempt, undefined);
});
test("serialized persistence prevents a slow draft write from replacing later accepted state", async () => {
  let value: string | null = null;
  let first = true;
  let release!: () => void;
  const storage: Storage = {
    get: async () => value,
    remove: async () => {
      value = null;
    },
    set: async (_, v) => {
      if (first) {
        first = false;
        await new Promise<void>((r) => {
          release = r;
        });
      }
      value = v;
    },
  };
  const store = new ComposerStore(storage, "h", "s");
  const old = store.write({ draft: { ...emptyDraft(), text: "old" } });
  const latest = store.write({ draft: emptyDraft() });
  await new Promise<void>((r) => setImmediate(r));
  release();
  await Promise.all([old, latest]);
  assert.equal((await store.read()).draft.text, "");
});

for (const outcome of ["accepted", "rejected", "discarded"] as const) {
  test(`unmount during delayed ${outcome} persistence cannot restore the pending attempt`, async () => {
    let value: string | null = null;
    let writes = 0;
    let release!: () => void;
    const storage: Storage = {
      get: async () => value,
      remove: async () => {
        value = null;
      },
      set: async (_, next) => {
        if (++writes === 2)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        value = next;
      },
    };
    const store = new ComposerStore(storage, "home", "session");
    const draft = { ...emptyDraft(), text: "Implement the change" };
    const current: { current: ComposerState } = {
      current: {
        draft,
        attempt: { ...draft, client_message_id: "original-id", steer: false },
      },
    };
    await store.write(current.current);
    const next = { draft: outcome === "rejected" ? draft : emptyDraft() };
    const transition = store.transition(current, next);
    await new Promise<void>((resolve) => setImmediate(resolve));
    // Mirrors the screen's unmount cleanup while the transition is still writing.
    const unmount = store.write(current.current);
    release();
    await Promise.all([transition, unmount]);
    const reopened = await new ComposerStore(storage, "home", "session").read();
    assert.deepEqual(reopened, next);
    assert.equal(reopened.attempt, undefined);
  });
}

test("failed accepted-state persistence keeps cleanup pointed at accepted state", async () => {
  let value: string | null = null;
  let writes = 0;
  const storage: Storage = {
    get: async () => value,
    remove: async () => {
      value = null;
    },
    set: async (_, next) => {
      if (++writes === 2) throw new Error("disk unavailable");
      value = next;
    },
  };
  const store = new ComposerStore(storage, "home", "session");
  const draft = { ...emptyDraft(), text: "Already accepted" };
  const current: { current: ComposerState } = {
    current: {
      draft,
      attempt: { ...draft, client_message_id: "same-id", steer: false },
    },
  };
  await store.write(current.current);
  await assert.rejects(
    store.transition(current, { draft: emptyDraft() }),
    /disk unavailable/,
  );
  await store.write(current.current);
  assert.deepEqual(await store.read(), { draft: emptyDraft() });
});
