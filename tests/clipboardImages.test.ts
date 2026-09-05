import assert from "node:assert/strict";
import test from "node:test";
import { clipboardImageFiles } from "../src/clipboardImages";

function clipboardData(
  files: File[] = [],
  items: Array<Pick<DataTransferItem, "kind" | "getAsFile">> = [],
): Pick<DataTransfer, "files" | "items"> {
  return {
    files: files as unknown as FileList,
    items: items as unknown as DataTransferItemList,
  };
}

test("reads image files exposed directly by the clipboard", () => {
  const image = { type: "image/png" } as File;

  assert.deepEqual(clipboardImageFiles(clipboardData([image])), [image]);
});

test("falls back to clipboard items when the file list is empty", () => {
  const image = { type: "image/png" } as File;

  assert.deepEqual(clipboardImageFiles(clipboardData([], [
    { kind: "file", getAsFile: () => image },
  ])), [image]);
});

test("ignores non-image and empty clipboard items", () => {
  const textFile = { type: "text/plain" } as File;

  assert.deepEqual(clipboardImageFiles(clipboardData([], [
    { kind: "string", getAsFile: () => null },
    { kind: "file", getAsFile: () => textFile },
    { kind: "file", getAsFile: () => null },
  ])), []);
});
