import test from "node:test";
import assert from "node:assert/strict";
import {
  daemonPath,
  fileSaveInput,
  imagePreviewUri,
} from "../src/core/fileEditor";

test("file saves preserve the opened revision and never manufacture a new baseline", () => {
  const file = {
    path: "/repo/a.ts",
    name: "a.ts",
    content: "old",
    contentRevision: "old-hash",
    sizeBytes: 3,
    mtimeMs: 123,
    readOnly: false,
  };
  assert.deepEqual(fileSaveInput(file, "draft", "s1"), {
    path: "/repo/a.ts",
    content: "draft",
    expectedMtimeMs: 123,
    expectedContentRevision: "old-hash",
    sessionId: "s1",
  });
  assert.throws(() => fileSaveInput({ ...file, readOnly: true }, "edit"));
});
test("remote paths cannot turn into a phone URL", () => {
  for (const path of [
    "file:///etc/passwd",
    "https://other.example/image",
    "data://foo",
    "/repo/\0secret",
  ])
    assert.throws(() => daemonPath(path));
  assert.equal(daemonPath("/repo/file.ts"), "/repo/file.ts");
  assert.equal(daemonPath("C:\\repo\\file.ts"), "C:\\repo\\file.ts");
});
test("image previews embed only bounded daemon-provided raster bytes", () => {
  const file = {
    path: "/repo/image",
    name: "image",
    mediaType: "image/png",
    dataBase64: "YWJj",
    sizeBytes: 3,
    mtimeMs: 1,
  };
  assert.equal(imagePreviewUri(file), "data:image/png;base64,YWJj");
  assert.throws(() => imagePreviewUri({ ...file, mediaType: "image/svg+xml" }));
  assert.throws(() =>
    imagePreviewUri({ ...file, dataBase64: "https://attacker.example" }),
  );
});

test("relative file requests carry daemon session directory and explicit user-open intent", async () => {
  const { DaemonClient } = await import("../src/core/client");
  let body: unknown;
  const client = new DaemonClient(
    {
      id: "home",
      name: "Home",
      baseUrl: "https://home.test",
      token: "home-token",
    },
    async (url, init) => {
      assert.equal(url, "https://home.test/files/open");
      body = JSON.parse(String(init?.body));
      return Response.json({
        code: "ok",
        data: {
          kind: "text",
          file: {
            path: "/repo/src/main.ts",
            name: "main.ts",
            content: "",
            sizeBytes: 0,
            mtimeMs: 1,
            readOnly: false,
          },
        },
      });
    },
  );
  await client.openFile("src/main.ts", "session-a", true, {
    basePath: "/repo",
    baseKind: "directory",
  });
  assert.deepEqual(body, {
    path: "src/main.ts",
    sessionId: "session-a",
    explicitOpen: true,
    basePath: "/repo",
    baseKind: "directory",
  });
});
