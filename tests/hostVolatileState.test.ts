import assert from "node:assert/strict";
import test from "node:test";

import { hostSwitchHasActiveSave, normalizeHostFilesForRestore } from "../src/hostVolatileState";

test("host switching blocks synchronous and rendered active saves", () => {
  assert.equal(hostSwitchHasActiveSave({}, 1), true);
  assert.equal(hostSwitchHasActiveSave({ file: { saveStatus: "saving" } }, 0), true);
  assert.equal(hostSwitchHasActiveSave({ file: { saveStatus: "dirty" } }, 0), false);
});

test("a cached in-flight save resumes as dirty instead of staying stuck", () => {
  const clean = { file: { saveStatus: "clean" as const, draft: "saved" } };
  assert.equal(normalizeHostFilesForRestore(clean), clean);
  assert.deepEqual(normalizeHostFilesForRestore({
    file: { saveStatus: "saving" as const, draft: "unsaved" },
  }), {
    file: { saveStatus: "dirty", draft: "unsaved" },
  });
});
