import { createApplicationService } from "../backend/applicationService";
import { createClientApi } from "../shared/clientApi";
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { uploadMessageFiles } from "../backend/zotigod";
import { withConnection } from "../backend/hosts";

test("file uploads send binary bytes to the selected daemon and return only file references", async () => {
  const payload = Buffer.from([0, 1, 255, 127]);
  let requests = 0;
  let reject = false;
  const daemon = createServer(async (req, res) => {
    requests++;
    assert.equal(req.headers.authorization, "Bearer attachment-test");
    assert.equal(req.headers["content-type"], "application/octet-stream");
    const url = new URL(req.url!, "http://localhost");
    assert.equal(url.pathname, "/files/upload");
    assert.equal(url.searchParams.get("sessionId"), "session");
    assert.equal(url.searchParams.get("name"), "录屏.mp4");
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), payload);
    res.writeHead(reject ? 403 : 201, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reject ? { code: "denied", message: "Upload denied" } : { code: "ok", data: { path: "/workspace/artifacts/attachments/session/clip.mp4" } }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  const connection = { id: "attachments", name: "Attachments", baseUrl: `http://127.0.0.1:${address.port}`, token: "attachment-test" };
  try {
    await withConnection(connection, async () => {
      const files = [{ name: "录屏.mp4", data_base64: payload.toString("base64") }];
      const prompt = await uploadMessageFiles("session", "Inspect this", files);
      assert.match(prompt, /^Inspect this/);
      assert.match(prompt, /\[录屏.mp4\]/);
      assert.match(prompt, /artifacts\/attachments\/session\/clip.mp4/);
      assert.ok(!prompt.includes(payload.toString("base64")));
      const unexpected = async () => { throw new Error("Unexpected native operation"); };
      const service = createApplicationService({ openPath: unexpected, openExternal: unexpected, downloadImage: unexpected }, () => {});
      const api = createClientApi({
        invoke: async <T>(channel: string, ...args: unknown[]) => {
          const result = await service.invoke(channel, JSON.parse(JSON.stringify(args)));
          if (!result.ok) throw new Error(result.error);
          return result.value as T;
        },
        onFileEvent: () => () => {}, onSessionEvent: () => () => {},
      });
      assert.equal(await api.uploadAttachment("session", files[0]), "/workspace/artifacts/attachments/session/clip.mp4");
      await assert.rejects(api.uploadAttachment("session", { ...files[0], name: "../bad" }), /filename/);
      reject = true;
      await assert.rejects(uploadMessageFiles("session", "", files), /Upload denied/);
      assert.equal(await uploadMessageFiles("session", "unchanged", []), "unchanged");
    });
    assert.equal(requests, 3);
  } finally { daemon.close(); await once(daemon, "close"); }
});
