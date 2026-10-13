import test from "node:test";
import assert from "node:assert/strict";
import type {
  CatalogWorkspace,
  ProfilesResponse,
} from "@zotigo/shared/zotigod";
import { sessionContextReady } from "../src/core/newSession";
const workspace: CatalogWorkspace = {
  id: "w",
  project_id: "p",
  title: "Ready",
  root_path: "/workspace/selected",
  status: "ready",
  created_at: "",
  updated_at: "",
};
const profiles: ProfilesResponse = {
  default_profile: "default",
  profiles: [{ name: "default", provider: "openai", model: "model" }],
};
test("Scratch supports Codex while selected workspaces must be ready", () => {
  assert.equal(
    sessionContextReady(undefined, "codex", undefined, undefined, ""),
    true,
  );
  assert.equal(
    sessionContextReady(
      { ...workspace, status: "provisioning" },
      "codex",
      undefined,
      undefined,
      "",
    ),
    false,
  );
  assert.equal(
    sessionContextReady(workspace, "codex", undefined, undefined, ""),
    true,
  );
});
test("native runtime creation rejects stale-directory, missing and unavailable profile selections", () => {
  assert.equal(
    sessionContextReady(
      workspace,
      "zotigo",
      profiles,
      "/workspace/old",
      "default",
    ),
    false,
  );
  assert.equal(
    sessionContextReady(
      workspace,
      "zotigo",
      undefined,
      workspace.root_path,
      "default",
    ),
    false,
  );
  assert.equal(
    sessionContextReady(
      workspace,
      "zotigo",
      profiles,
      workspace.root_path,
      "removed",
    ),
    false,
  );
  assert.equal(
    sessionContextReady(
      workspace,
      "zotigo",
      profiles,
      workspace.root_path,
      "default",
    ),
    true,
  );
});

test("Scratch profiles must not come from a previous workspace", () => {
  assert.equal(
    sessionContextReady(undefined, "zotigo", profiles, undefined, "default"),
    true,
  );
  assert.equal(
    sessionContextReady(
      undefined,
      "zotigo",
      profiles,
      workspace.root_path,
      "default",
    ),
    false,
  );
  assert.equal(
    sessionContextReady(undefined, "zotigo", undefined, undefined, "default"),
    false,
  );
});
