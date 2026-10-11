import test from "node:test";
import assert from "node:assert/strict";
import { DaemonClient } from "../src/core/client";
import { fixtureFetch, preview } from "./preview/fixtures";
const client = (host: string) =>
  new DaemonClient(
    {
      id: host,
      name: host,
      baseUrl: `https://${host}.fixture.test`,
      token: "fixture-token",
    },
    fixtureFetch,
  );

test("visual preview uses two isolated daemon datasets with shared session identifiers", async () => {
  preview.reset();
  const home = client("home"),
    work = client("work");
  const homeRows = await home.catalog(),
    workRows = await work.catalog();
  assert.equal(homeRows[0].runtime?.id, workRows[0].runtime?.id);
  assert.notEqual(
    homeRows[0].organization?.title,
    workRows[0].organization?.title,
  );
  await home.renameSession("session-shared", "Renamed only at home");
  assert.notEqual(
    (await home.catalog())[0].organization?.title,
    (await work.catalog())[0].organization?.title,
  );
  assert.equal(
    (await home.items("session-shared")).items.some(
      (item) => !!item.approval?.id,
    ),
    true,
  );
  assert.equal(
    (await home.items("session-shared")).items.some((item) =>
      item.content?.some((part) => !!part.image?.url),
    ),
    true,
  );
  await assert.rejects(
    fixtureFetch("https://real.example/health"),
    /no real network request/,
  );
});
test("visual preview faults preserve HTTP semantics and recover without changing the production client", async () => {
  preview.reset();
  const home = client("home");
  preview.fault("home", "catalog");
  await assert.rejects(home.catalog(), /catalog is temporarily unavailable/);
  preview.fault("home", "none");
  assert.ok((await home.catalog()).length > 0);
  const opened = await home.openFile("/workspace/zotigo-mobile/src/client.ts");
  assert.equal(opened.kind, "text");
  preview.fault("home", "save-conflict");
  await assert.rejects(
    home.saveFile({
      path: "/workspace/zotigo-mobile/src/client.ts",
      content: "draft",
      expectedMtimeMs: 1,
      expectedContentRevision: "1",
    }),
    /changed externally/,
  );
  preview.fault("home", "none");
  const saved = await home.saveFile({
    path: "/workspace/zotigo-mobile/src/client.ts",
    content: "draft",
    expectedMtimeMs: 1,
    expectedContentRevision: "1",
  });
  assert.equal(saved.content, "draft");
  assert.equal(saved.contentRevision, "2");
});
test("preview checks image byte MIME, records submission ID, and returns genuine action errors", async () => {
  preview.reset();
  const home = client("home");
  const jpeg = Buffer.from([
    255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1,
  ]).toString("base64");
  await assert.rejects(
    home.send("session-shared", {
      text: "Wrong MIME",
      client_message_id: "bad-image",
      images: [{ mime_type: "image/png", data_base64: jpeg }],
    }),
    /does not match/,
  );
  assert.equal(preview.snapshot("home").lastSubmission?.accepted, false);
  await home.send("session-shared", {
    text: "Correct MIME",
    client_message_id: "good-image",
    images: [{ mime_type: "image/jpeg", data_base64: jpeg }],
  });
  assert.equal(preview.snapshot("home").lastSubmission?.accepted, true);
  assert.equal(
    preview.snapshot("home").lastSubmission?.body.client_message_id,
    "good-image",
  );
  preview.fault("home", "send-rejected");
  await assert.rejects(
    home.send("session-shared", {
      text: "Rejected",
      client_message_id: "rejected",
    }),
    /message rejected/,
  );
  preview.fault("home", "none");
  await home.pinSession("session-shared", false);
  assert.equal((await home.catalog())[0].organization?.pinned_at, null);
});
test("preview preserves chosen workspace projection and mutates only that workspace source membership", async () => {
  preview.reset();
  const home = client("home");
  const workspace = await home.createWorkspace(
    "project-mobile",
    "Empty review workspace",
    [],
  );
  assert.deepEqual(await home.workspaceSources(workspace.id), []);
  const created = await home.createSession({
    workspaceId: workspace.id,
    agent: "codex",
    model: "gpt-5.3-codex",
  });
  const row = (await home.catalog()).find(
    (item) => item.runtime?.id === created.id,
  )!;
  assert.equal(row.organization?.workspace_id, workspace.id);
  assert.equal(row.organization?.project_id, "project-mobile");
  const binding = await home.addWorkspaceSource(workspace.id, {
    source_id: "source-ui",
  });
  assert.equal(binding.source.id, "source-ui");
  assert.equal((await home.workspaceSources(workspace.id)).length, 1);
  await assert.rejects(
    home.addWorkspaceSource(workspace.id, { source_id: "source-ui" }),
    /already bound/,
  );
  assert.equal(
    (await home.archivePreview(workspace.id)).workspace_id,
    workspace.id,
  );
  await home.archiveWorkspace(workspace.id);
  assert.ok(
    (await home.catalog()).find((item) => item.runtime?.id === created.id)
      ?.organization?.workspace_archived_at,
  );
});
