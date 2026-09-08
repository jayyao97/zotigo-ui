import assert from "node:assert/strict";
import test from "node:test";

import { defaultActivityDisclosureOpen, defaultThinkingDisclosureOpen, parseThinkingDisplayMode } from "../src/thinkingDisplay";

test("parseThinkingDisplayMode accepts supported values and defaults unknown values to auto", () => {
  assert.equal(parseThinkingDisplayMode("auto"), "auto");
  assert.equal(parseThinkingDisplayMode("expanded"), "expanded");
  assert.equal(parseThinkingDisplayMode("collapsed"), "collapsed");
  assert.equal(parseThinkingDisplayMode("unexpected"), "auto");
  assert.equal(parseThinkingDisplayMode(null), "auto");
});

test("defaultThinkingDisclosureOpen follows the selected display mode", () => {
  assert.equal(defaultThinkingDisclosureOpen("auto", true), true);
  assert.equal(defaultThinkingDisclosureOpen("auto", false), false);
  assert.equal(defaultThinkingDisclosureOpen("expanded", true), true);
  assert.equal(defaultThinkingDisclosureOpen("expanded", false), true);
  assert.equal(defaultThinkingDisclosureOpen("collapsed", true), false);
  assert.equal(defaultThinkingDisclosureOpen("collapsed", false), false);
});

test("expanded mode reveals reasoning nested inside completed activity", () => {
  assert.equal(defaultActivityDisclosureOpen(false, true, "expanded"), true);
  assert.equal(defaultActivityDisclosureOpen(false, true, "auto"), false);
  assert.equal(defaultActivityDisclosureOpen(false, true, "collapsed"), false);
  assert.equal(defaultActivityDisclosureOpen(false, true, undefined), false);
  assert.equal(defaultActivityDisclosureOpen(false, false, "expanded"), false);
  assert.equal(defaultActivityDisclosureOpen(true, false, "collapsed"), true);
});
