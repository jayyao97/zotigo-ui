import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextUsageBadge } from "../src/conversation/ContextUsageBadge";

test("context usage preserves overflow while capping the ring and labels calibration", () => {
  const html = renderToStaticMarkup(<ContextUsageBadge usage={{ tokens: 542000, window: 512000, source: "provider_estimate" }} />);
  assert.match(html, /106% used/);
  assert.match(html, /over limit/);
  assert.match(html, /--context-used:360deg/);
  assert.match(html, /API input \+ estimated additions/);
});

test("local estimates and provider measurements have distinct labels", () => {
  assert.match(renderToStaticMarkup(<ContextUsageBadge usage={{ tokens: 100, window: 1000, source: "estimate" }} />), /Local estimate/);
  const measured = renderToStaticMarkup(<ContextUsageBadge usage={{ tokens: 100, window: 1000, source: "provider" }} />);
  assert.match(measured, /10% used/);
  assert.doesNotMatch(measured, /estimate/);
});
