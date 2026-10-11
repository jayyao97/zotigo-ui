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
      "file:///private/photo.png",
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
  const original = client.openFile;
  const calls: boolean[] = [];
  client.openFile = async (_path, _session, explicit = false) => {
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
    client.openFile = original;
  }
});
