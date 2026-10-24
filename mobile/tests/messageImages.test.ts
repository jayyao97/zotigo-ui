import test from "node:test";
import assert from "node:assert/strict";
import { userImages, messageImage } from "../src/core/messageImages";
import { DaemonClient } from "../src/core/client";
import type { DisplayItem } from "@zotigo/shared/zotigod";
const origin = "https://home.test";
const client = new DaemonClient(
  { id: "home", name: "Home", baseUrl: origin, token: "secret" },
  async () => {
    throw new Error("Unexpected network request");
  },
);
test("Codex local user attachments use the public image endpoint; duplicate URLs render once", () => {
  const item = {
    sequence: 12,
    content: [
      { image: { url: "/tmp/photo.png" } },
      { image: { url: "/sessions/s/images/photo" } },
    ],
    command: { images: [{ url: "/sessions/s/images/photo" }] },
  } as DisplayItem;
  assert.deepEqual(userImages(item, origin, "s"), [
    origin + "/sessions/s/images/codex-input-12-0",
    origin + "/sessions/s/images/photo",
  ]);
});
test("external images never use the authenticated daemon image transport", async () => {
  const original = client.image;
  client.image = async () => {
    throw new Error("must not send credentials");
  };
  try {
    assert.equal(
      await messageImage(client, "https://other.test/photo.png", "s"),
      "https://other.test/photo.png",
    );
    for (const source of [
      "javascript:alert(1)",
      "//other.test/photo.png",
      "https://user:pass@other.test/photo.png",
    ])
      await assert.rejects(messageImage(client, source, "s"));
  } finally {
    client.image = original;
  }
});
test("workspace image confirmation is preserved until explicitly approved", async () => {
  const original = client.previewImage;
  const calls: boolean[] = [];
  client.previewImage = async (_path, _session, explicit = false) => {
    calls.push(explicit);
    return explicit
      ? {
          kind: "image",
          file: {
            path: "/tmp/a.png",
            name: "a.png",
            mediaType: "image/png",
            dataBase64: "AAAA",
            sizeBytes: 3,
            mtimeMs: 0,
          },
        }
      : { kind: "requires_confirmation", path: "/tmp/a.png" };
  };
  try {
    assert.equal(await messageImage(client, "/tmp/a.png", "s"), null);
    assert.equal(
      await messageImage(client, "/tmp/a.png", "s", true),
      "data:image/png;base64,AAAA",
    );
    assert.deepEqual(calls, [false, true]);
  } finally {
    client.previewImage = original;
  }
});


test("local image previews match desktop path decoding and confirmation protocol", async () => {
  const requests: Record<string, unknown>[] = [];
  const imageClient = new DaemonClient(
    { id: "test", name: "Test", baseUrl: origin, token: "secret" },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return Response.json({ code: "ok", data: body.explicitOpen
        ? { kind: "image", file: { mediaType: "image/png", dataBase64: "AAAA", sizeBytes: 3 } }
        : { kind: "requires_confirmation" } });
    },
  );
  assert.equal(await messageImage(imageClient, "/tmp/%E5%9B%BE%20one.png", "s"), null);
  assert.equal(requests[0].path, "/tmp/图 one.png");
  assert.equal(requests[0].imageOnly, true);
  assert.equal(requests[0].explicitOpen, false);
  assert.equal(await messageImage(imageClient, "/tmp/%E5%9B%BE%20one.png", "s", true), "data:image/png;base64,AAAA");
  assert.equal(requests[1].explicitOpen, true);
  await messageImage(imageClient, "file:///tmp/a%20b.png", "s");
  assert.equal(requests[2].path, "file:///tmp/a%20b.png");
});


test("relative image retry rereads the same daemon path using the session directory", async () => {
  let reads = 0;
  const imageClient = new DaemonClient(
    { id: "test", name: "Test", baseUrl: origin, token: "secret" },
    async (url, init) => {
      if (url.endsWith("/sessions/s")) return Response.json({ code: "ok", data: { id: "s", working_directory: "/workspace" } });
      const body = JSON.parse(String(init?.body));
      assert.equal(body.path, "images/图 one.png");
      assert.equal(body.basePath, "/workspace");
      assert.equal(body.baseKind, "directory");
      assert.equal(body.imageOnly, true);
      reads++;
      if (reads === 1) return Response.json({ code: "not_found", message: "image not ready" }, { status: 404 });
      return Response.json({ code: "ok", data: { kind: "image", file: { mediaType: "image/png", dataBase64: "AAAA", sizeBytes: 3 } } });
    },
  );
  await assert.rejects(messageImage(imageClient, "images/%E5%9B%BE%20one.png", "s"));
  assert.equal(await messageImage(imageClient, "images/%E5%9B%BE%20one.png", "s"), "data:image/png;base64,AAAA");
  assert.equal(reads, 2);
});
