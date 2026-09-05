import assert from "node:assert/strict";
import test from "node:test";

import {
  decodedBase64Size,
  maxMessageImageBytes,
  maxMessageTotalImageBytes,
  messageImageSizeError,
} from "../shared/messageImages";

test("enforces daemon-compatible message image limits", () => {
  assert.equal(messageImageSizeError([1, 2, 3]), null);
  assert.equal(messageImageSizeError(Array(6).fill(1)), "A message can include at most 5 images.");
  assert.equal(messageImageSizeError([maxMessageImageBytes + 1]), "Each image must be 5 MiB or smaller.");
  assert.equal(
    messageImageSizeError([maxMessageImageBytes, maxMessageImageBytes, maxMessageImageBytes, maxMessageImageBytes, 1]),
    "Images can total at most 20 MiB per message.",
  );
  assert.equal(messageImageSizeError([maxMessageTotalImageBytes]), "Each image must be 5 MiB or smaller.");
});

test("computes decoded base64 size without allocating decoded bytes", () => {
  assert.equal(decodedBase64Size(""), 0);
  assert.equal(decodedBase64Size("Zg=="), 1);
  assert.equal(decodedBase64Size("Zm8="), 2);
  assert.equal(decodedBase64Size("Zm9v"), 3);
});
