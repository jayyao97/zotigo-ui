import assert from "node:assert/strict";
import test from "node:test";
import {
  availableModelChoice,
  defaultModelChoice,
  type PickerAgent,
} from "../src/core/modelPicker";

const agents: PickerAgent[] = [
  {
    id: "codex",
    label: "Codex",
    models: [
      {
        id: "m",
        display_name: "M",
        is_default: true,
        supported_reasoning_efforts: ["medium", "high"],
      },
    ],
  },
  { id: "zotigo", label: "Zotigo" },
];
const profiles = {
  default_profile: "translate",
  profiles: [
    {
      name: "translate",
      model: "deepseek-flash",
      provider: "anthropic",
      thinking_level: "disabled",
    },
  ],
};
test("favorites match current host models and directory profiles", () => {
  assert.equal(
    availableModelChoice(
      { agent: "zotigo", profile: "translate" },
      agents,
      profiles,
    ),
    true,
  );
  assert.equal(
    availableModelChoice(
      { agent: "zotigo", profile: "elsewhere" },
      agents,
      profiles,
    ),
    false,
  );
  assert.equal(
    availableModelChoice(
      { agent: "codex", model: "m", reasoningEffort: "low" },
      agents,
      profiles,
    ),
    false,
  );
  assert.equal(
    availableModelChoice(
      { agent: "codex", model: "missing", reasoningEffort: "medium" },
      agents,
      profiles,
    ),
    false,
  );
});
test("existing sessions cannot choose another runtime through favorites", () => {
  assert.equal(
    availableModelChoice(
      { agent: "zotigo", profile: "translate" },
      agents,
      profiles,
      "codex",
    ),
    false,
  );
  assert.equal(
    availableModelChoice(
      { agent: "codex", model: "m", reasoningEffort: "high" },
      agents,
      profiles,
      "codex",
    ),
    true,
  );
});
test("late catalog data resolves defaults without inventing a profile or effort", () => {
  assert.deepEqual(defaultModelChoice("zotigo", agents, profiles), {
    agent: "zotigo",
    profile: "translate",
  });
  assert.deepEqual(defaultModelChoice("codex", agents), {
    agent: "codex",
    model: "m",
    reasoningEffort: "medium",
  });
  assert.equal(
    availableModelChoice(defaultModelChoice("codex", []), []),
    false,
  );
  assert.equal(
    availableModelChoice(defaultModelChoice("zotigo", agents), agents),
    false,
  );
});
