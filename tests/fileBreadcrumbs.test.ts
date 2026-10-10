import assert from "node:assert/strict";
import test from "node:test";
import { fileBreadcrumbs } from "../shared/fileBreadcrumbs";

test("file breadcrumbs retain intermediate directories within the workspace", () => {
  assert.deepEqual(fileBreadcrumbs("/work/ui/artifacts/activity-shimmer/before-after.gif", "/work/ui/"),
    ["ui", "artifacts", "activity-shimmer", "before-after.gif"]);
});

test("unmatched or absent roots show actual directories instead of a fabricated workspace parent", () => {
  const path = "/data00/home/user/ui/artifacts/activity-shimmer/before-after.gif";
  const expected = ["data00", "home", "user", "ui", "artifacts", "activity-shimmer", "before-after.gif"];
  assert.deepEqual(fileBreadcrumbs(path, "/home/user/ui"), expected);
  assert.deepEqual(fileBreadcrumbs(path), expected);
  assert.deepEqual(fileBreadcrumbs("/work/ui-other/a.txt", "/work/ui"), ["work", "ui-other", "a.txt"]);
});

test("file breadcrumbs handle Windows separators and filesystem roots", () => {
  assert.deepEqual(fileBreadcrumbs("C:\\work\\ui\\docs\\readme.md", "C:\\work\\ui\\"), ["ui", "docs", "readme.md"]);
  assert.deepEqual(fileBreadcrumbs("/docs/readme.md", "/"), ["docs", "readme.md"]);
});
