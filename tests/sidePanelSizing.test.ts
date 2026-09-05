import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSidePanelWidth,
  defaultSidePanelRatio,
  defaultSidePanelWidth,
  minimumSidePanelWidth,
  sidePanelWidthForRatio,
} from "../shared/sidePanelSizing";

test("side panel sizing preserves both panes at the default window width", () => {
  assert.equal(clampSidePanelWidth(defaultSidePanelWidth, 1005), 520);
  assert.equal(clampSidePanelWidth(800, 1005), 585);
  assert.equal(clampSidePanelWidth(200, 1005), minimumSidePanelWidth);
});

test("side panel sizing yields space to the conversation at the minimum window width", () => {
  assert.equal(clampSidePanelWidth(defaultSidePanelWidth, 845), 425);
});

test("side panel sizing preserves the split ratio when the window changes", () => {
  assert.equal(sidePanelWidthForRatio(defaultSidePanelRatio, 1000), 500);
  assert.equal(sidePanelWidthForRatio(defaultSidePanelRatio, 1400), 700);
});
