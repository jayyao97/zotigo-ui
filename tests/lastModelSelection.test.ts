import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { loadLastModelSelection, saveLastModelSelection } from "../src/lastModelSelection";

test("last explicit model choice persists per host independently of favorite management", () => {
  const dom = new JSDOM("", { url: "https://zotigo.test" });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: dom.window.localStorage });
  try {
    const choice = { agent: "codex", model: "model-a", reasoningEffort: "high" } as const;
    saveLastModelSelection("local", choice);
    saveLastModelSelection("dev", { agent: "zotigo", profile: "gemini" });
    localStorage.setItem("zotigo.model-favorites.v1:local", "[]");
    assert.deepEqual(loadLastModelSelection("local"), choice);
    assert.deepEqual(loadLastModelSelection("dev"), { agent: "zotigo", profile: "gemini" });
    assert.equal(loadLastModelSelection("another"), null);
    saveLastModelSelection("local", { agent: "codex", model: "", reasoningEffort: "" });
    assert.deepEqual(loadLastModelSelection("local"), choice);
    for (const value of ["broken", "null", '{"agent":"other"}', '{"agent":"codex","model":5}']) {
      localStorage.setItem("zotigo.last-model.v1:local", value);
      assert.equal(loadLastModelSelection("local"), null);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
    dom.window.close();
  }
});
