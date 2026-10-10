import assert from "node:assert/strict";
import test from "node:test";
import { attachmentReference, attachmentSizeError, maxAttachmentBytes, parseMessageFiles } from "../shared/messageFiles";
import { parseMarkdownLink } from "../shared/markdownLinks";

test("file attachments retain exact binary payloads and reject invalid sizes and names", () => {
  const file = { name: "录屏.mp4", data_base64: Buffer.from([0, 128, 255]).toString("base64") };
  assert.deepEqual(parseMessageFiles([file]), [file]);
  assert.deepEqual(parseMessageFiles([{ name: "empty.txt", data_base64: "" }]), [{ name: "empty.txt", data_base64: "" }]);
  for (const name of ["../x", "a/b", "a\\b", "..", "", "\nfile", "文".repeat(61)]) {
    assert.throws(() => parseMessageFiles([{ ...file, name }]));
  }
  for (const data_base64 of ["!!!!", "a===", "YW=J", "abc"]) assert.throws(() => parseMessageFiles([{ ...file, data_base64 }]));
  assert.equal(attachmentSizeError([{ size: maxAttachmentBytes, image: false }]), null);
  assert.match(attachmentSizeError([{ size: maxAttachmentBytes + 1, image: false }])!, /20 MiB/);
  assert.match(attachmentSizeError([{ size: maxAttachmentBytes, image: true }])!, /5 MiB/);
  assert.match(attachmentSizeError(Array(6).fill({ size: 1, image: false }))!, /5 attachments/);
  // Large payload validation must not overflow the regexp stack.
  assert.equal(parseMessageFiles([{ name: "large.bin", data_base64: Buffer.alloc(maxAttachmentBytes).toString("base64") }]).length, 1);
});

test("file references escape Markdown and preserve special characters in local paths", () => {
  const path = "/workspace/a (b)#c?.mp4";
  const ref = attachmentReference("[clip]*.mp4", path);
  assert.ok(ref.startsWith("[\\[clip\\]\\*.mp4]"));
  const href = ref.slice(ref.indexOf("(<") + 2, -2);
  const parsed = parseMarkdownLink(href);
  assert.equal(parsed.kind, "local");
  if (parsed.kind === "local") assert.equal(parsed.path, path);
  for (const name of ["report:12", "report#L12", "report%20.txt", "文档?.txt"]) {
    const filePath = `/workspace/${name}`;
    const reference = attachmentReference(name, filePath);
    const link = parseMarkdownLink(reference.slice(reference.indexOf("(<") + 2, -2));
    assert.equal(link.kind, "local");
    if (link.kind === "local") {
      assert.equal(link.path, filePath);
      assert.equal(link.line, undefined);
    }
  }
});
