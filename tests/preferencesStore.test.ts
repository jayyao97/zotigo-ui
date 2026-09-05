import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  closePreferencesStore,
  getCatalogOrder,
  getCatalogSelection,
  getWindowBoundsPreference,
  initializePreferencesStore,
  setCatalogOrder,
  setCatalogSelection,
  setWindowBoundsPreference,
} from "../backend/preferencesStore";

const directories: string[] = [];

afterEach(() => {
  closePreferencesStore();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

test("persists only Desktop presentation preferences", () => {
  const directory = temporaryDirectory();
  initializePreferencesStore(directory);
  setWindowBoundsPreference({ x: 10, y: 20, width: 1200, height: 800 });
  setCatalogSelection({ projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1" });
  setCatalogOrder("projects", ["project-2", "project-1"]);
  closePreferencesStore();

  initializePreferencesStore(directory);
  assert.deepEqual(getWindowBoundsPreference(), { x: 10, y: 20, width: 1200, height: 800 });
  assert.deepEqual(getCatalogSelection(), {
    projectId: "project-1",
    workspaceId: "workspace-1",
    sessionId: "session-1",
  });
  assert.deepEqual(getCatalogOrder("projects"), ["project-2", "project-1"]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(directory, "desktop-preferences.json"), "utf8"))), [
    "selection",
    "orders",
    "windowBounds",
  ]);
});

test("starts clean when preferences are malformed", () => {
  const directory = temporaryDirectory();
  fs.writeFileSync(path.join(directory, "desktop-preferences.json"), "not-json");
  initializePreferencesStore(directory);
  assert.equal(getWindowBoundsPreference(), null);
  assert.deepEqual(getCatalogSelection(), { projectId: null, workspaceId: null, sessionId: null });
  assert.deepEqual(getCatalogOrder("projects"), []);
});

test("rejects duplicate display-order ids", () => {
  initializePreferencesStore(temporaryDirectory());
  assert.throws(() => setCatalogOrder("projects", ["same", "same"]), /unique/);
});

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zotigo-preferences-"));
  directories.push(directory);
  return directory;
}
