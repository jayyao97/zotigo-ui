import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { withConnection } from "../backend/hosts";
import { listQueuedInputs, queueSessionMessage } from "../backend/zotigod";

test("unsupported queues stay distinct from empty queues and transport failures", async () => {
  let status = 404;
  const daemon = createServer((_request, response) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(status === 200 ? { code: "ok", data: { items: [] } } : { message: "unavailable" }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  const connection = { id: "queue-test", name: "Test", baseUrl: `http://127.0.0.1:${address.port}`, token: "" };
  try {
    await withConnection(connection, async () => {
      for (const unsupported of [404, 405]) {
        status = unsupported;
        assert.equal(await listQueuedInputs("s"), null);
        await assert.rejects(queueSessionMessage("s", "next", [], []), /Update the connected daemon/);
      }
      status = 200;
      assert.deepEqual(await listQueuedInputs("s"), []);
      status = 500;
      await assert.rejects(listQueuedInputs("s"), /unavailable/);
    });
  } finally { daemon.close(); await once(daemon, "close"); }
});
