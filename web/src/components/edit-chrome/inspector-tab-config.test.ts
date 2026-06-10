import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveInspectorVisibleTabs,
} from "./inspector-tab-config";

// Minimal BuilderNode stubs that satisfy the type expected by
// resolveStandaloneBuilderNodeForContent → resolveInspectorVisibleTabs.
// We pass a "heading" node (the simplest non-container node kind) and a
// "container" node to cover both branches of nodeUsesLayoutInspector.

const HEADING_NODE = {
  id: "test-heading-1",
  kind: "heading" as const,
  props: { text: "Hello", level: "h2" as const },
};

const CONTAINER_NODE = {
  id: "test-container-1",
  kind: "container" as const,
  props: {},
  children: [],
};

test("builder node (heading) resolves motion tab", () => {
  const tabs = resolveInspectorVisibleTabs({
    sectionTypeKey: null,
    selectedStandaloneBuilderNode: HEADING_NODE as never,
  });
  assert.ok(tabs.includes("motion"), `Expected "motion" tab; got: ${JSON.stringify(tabs)}`);
});

test("builder node (container) resolves motion tab", () => {
  const tabs = resolveInspectorVisibleTabs({
    sectionTypeKey: null,
    selectedStandaloneBuilderNode: CONTAINER_NODE as never,
  });
  assert.ok(tabs.includes("motion"), `Expected "motion" tab; got: ${JSON.stringify(tabs)}`);
});

test("builder node (heading) tab order: content then style then motion", () => {
  const tabs = resolveInspectorVisibleTabs({
    sectionTypeKey: null,
    selectedStandaloneBuilderNode: HEADING_NODE as never,
  });
  // motion must appear after content and style (always at the end)
  const motionIdx = tabs.indexOf("motion");
  const contentIdx = tabs.indexOf("content");
  const styleIdx = tabs.indexOf("style");
  assert.ok(motionIdx > -1, "motion present");
  assert.ok(contentIdx > -1, "content present");
  assert.ok(styleIdx > -1, "style present");
  assert.ok(
    motionIdx > contentIdx,
    `motion (${motionIdx}) should come after content (${contentIdx})`,
  );
  assert.ok(
    motionIdx > styleIdx,
    `motion (${motionIdx}) should come after style (${styleIdx})`,
  );
});

test("section without a motion-enabled type does NOT resolve motion tab", () => {
  // trust_strip is in the list of sections without motion
  const tabs = resolveInspectorVisibleTabs({
    sectionTypeKey: "trust_strip",
    selectedStandaloneBuilderNode: null,
  });
  assert.ok(!tabs.includes("motion"), `Expected no "motion" tab; got: ${JSON.stringify(tabs)}`);
});

test("hero section resolves motion tab", () => {
  const tabs = resolveInspectorVisibleTabs({
    sectionTypeKey: "hero",
    selectedStandaloneBuilderNode: null,
  });
  assert.ok(tabs.includes("motion"), `Expected "motion" tab; got: ${JSON.stringify(tabs)}`);
});
