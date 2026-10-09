import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { getProfiles } from "../backend/zotigod";
import { withConnection } from "../backend/hosts";

test("new Scratch profile queries explicitly use global scope and existing directories remain explicit", async () => {
  const requests: string[] = [];
  const daemon = createServer((req, res) => {
    requests.push(req.url!);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "ok", data: { default_profile: "global", profiles: [] } }));
  });
  daemon.listen(0, "127.0.0.1"); await once(daemon, "listening");
  const address = daemon.address(); assert.ok(address && typeof address !== "string");
  try {
    await withConnection({ id: "profiles", name: "Profiles", baseUrl: `http://127.0.0.1:${address.port}`, token: "" }, async () => {
      await getProfiles(undefined, "global");
      await getProfiles("/scratch/session");
      await getProfiles();
    });
    assert.deepEqual(requests, ["/config/profiles?scope=global", "/config/profiles?working_directory=%2Fscratch%2Fsession", "/config/profiles"]);
  } finally { daemon.close(); await once(daemon, "close"); }
});
