import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClientApi } from "../shared/clientTypes";
import { bindClientGeneration } from "../shared/bindClientGeneration";

test("attachment preprocessing from an old host cannot invoke on a new host", async () => {
  let current = true; let sends = 0; let unsubscribes = 0;
  const api = bindClientGeneration({ sendConversationMessage: async () => { sends++; }, unsubscribeSessionEvents: async () => { unsubscribes++; } } as unknown as ClientApi, () => current);
  let finish!: () => void; const decoding = new Promise<void>((resolve) => { finish = resolve; });
  const send = async () => { await decoding; await api.sendConversationMessage({ conversationId: "same-id", text: "draft", images: [] }); };
  const pending = send(); current = false; finish();
  await assert.rejects(pending, /Host changed/);
  await api.unsubscribeSessionEvents();
  assert.equal(sends, 0); assert.equal(unsubscribes, 0);
});
