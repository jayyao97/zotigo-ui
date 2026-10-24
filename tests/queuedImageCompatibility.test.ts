import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { changeQueuedInput, listQueuedInputs, setDaemonBaseUrl } from "../backend/zotigod";

test("image edits require explicit daemon support before PATCH, text edits remain compatible", async () => {
  let capability: unknown = undefined;
  const patches: unknown[] = [];
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET") {
      response.end(JSON.stringify({ items: [{ id: "q", sequence: 0, type: "message", text: "hello", created_at: "", state: "queued", revision: 1, editable: true, image_editing_supported: capability }] }));
    } else {
      let body = "";
      for await (const chunk of request) body += chunk;
      patches.push(JSON.parse(body));
      response.end('{"ok":true}'); // Old daemons also respond successfully to unknown fields.
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
  try {
    for (capability of [undefined, false, "true"]) {
      assert.equal((await listQueuedInputs("s"))![0].image_editing_supported, false);
      await assert.rejects(changeQueuedInput("s", "q", 1, "hello", []), /Update the connected daemon/);
    }
    assert.equal(patches.length, 0);
    await changeQueuedInput("s", "q", 1, "edited");
    assert.deepEqual(patches, [{ revision: 1, text: "edited" }]);
    capability = true;
    await changeQueuedInput("s", "q", 1, "edited", []);
    assert.deepEqual(patches[1], { revision: 1, text: "edited", image_indices: [] });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
