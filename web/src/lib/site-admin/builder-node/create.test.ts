import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUILDER_NODE_COMPOSITION_PRESETS,
  createBuilderNode,
  createBuilderNodeCompositionPreset,
} from "./create";
import { validateBuilderNodeTree } from "./validate";

function assertValidCreatedNode(kind: Parameters<typeof createBuilderNode>[0]) {
  const node = createBuilderNode(kind);
  const tree = [wrapCreatedNodeForValidation(node)];
  const result = validateBuilderNodeTree(tree);
  assert.equal(result.ok, true, kind);
  return node;
}

function wrapCreatedNodeForValidation(node: ReturnType<typeof createBuilderNode>) {
  if (node.kind === "accordion_item") {
    return {
      id: "root-accordion",
      kind: "accordion" as const,
      props: {},
      children: [node],
    };
  }
  if (node.kind === "tab_panel") {
    return {
      id: "root-tabs",
      kind: "tabs" as const,
      props: {},
      children: [node],
    };
  }
  if (
    node.kind === "heading" ||
    node.kind === "paragraph" ||
    node.kind === "button" ||
    node.kind === "image" ||
    node.kind === "spacer"
  ) {
    return {
      id: "root-container",
      kind: "container" as const,
      props: { layout: "stack" as const },
      children: [node],
    };
  }
  return node;
}

test("createBuilderNode returns valid defaults for every node kind", () => {
  const kinds = [
    "section",
    "container",
    "split",
    "accordion",
    "accordion_item",
    "tabs",
    "tab_panel",
    "carousel",
    "masonry",
    "heading",
    "paragraph",
    "button",
    "image",
    "spacer",
  ] as const;

  for (const kind of kinds) {
    assertValidCreatedNode(kind);
  }
});

test("container starters include editable copy and CTA blocks", () => {
  const node = assertValidCreatedNode("container");
  assert.equal(node.kind, "container");
  if (node.kind !== "container") return;
  assert.deepEqual(
    node.children.map((child) => child.kind),
    ["heading", "paragraph", "button"],
  );
});

test("accordion starters include multiple editable items with answer copy", () => {
  const node = assertValidCreatedNode("accordion");
  assert.equal(node.kind, "accordion");
  if (node.kind !== "accordion") return;
  assert.equal(node.children.length, 3);
  assert.ok(node.children.every((child) => child.kind === "accordion_item"));
  for (const child of node.children) {
    assert.equal(child.kind, "accordion_item");
    if (child.kind !== "accordion_item") continue;
    assert.deepEqual(
      child.children.map((nested) => nested.kind),
      ["paragraph"],
    );
  }
});

test("tabs starters include multiple panels with headline and paragraph content", () => {
  const node = assertValidCreatedNode("tabs");
  assert.equal(node.kind, "tabs");
  if (node.kind !== "tabs") return;
  assert.equal(node.children.length, 3);
  assert.ok(node.children.every((child) => child.kind === "tab_panel"));
  for (const child of node.children) {
    assert.equal(child.kind, "tab_panel");
    if (child.kind !== "tab_panel") continue;
    assert.deepEqual(
      child.children.map((nested) => nested.kind),
      ["heading", "paragraph"],
    );
  }
});

test("gallery-like starters include usable image children", () => {
  const carousel = assertValidCreatedNode("carousel");
  const masonry = assertValidCreatedNode("masonry");
  assert.equal(carousel.kind, "carousel");
  assert.equal(masonry.kind, "masonry");
  if (carousel.kind !== "carousel" || masonry.kind !== "masonry") return;
  assert.deepEqual(
    carousel.children.map((child) => child.kind),
    ["image", "image", "image"],
  );
  assert.deepEqual(
    masonry.children.map((child) => child.kind),
    ["image", "image", "image", "image"],
  );
});

test("composition presets create valid premium nested sections", () => {
  for (const preset of BUILDER_NODE_COMPOSITION_PRESETS) {
    const node = createBuilderNodeCompositionPreset(preset.id);
    assert.equal(node.kind, preset.rootKind);
    assert.ok(preset.keywords.length >= 3, preset.id);
    assert.match(preset.dataMode, /^(starter|data-ready)$/);
    if (preset.dataMode === "data-ready") {
      assert.ok("dataBinding" in node.props, preset.id);
      assert.ok(node.props.dataBinding?.sourceKey, preset.id);
    }
    const result = validateBuilderNodeTree([node]);
    assert.equal(result.ok, true, preset.id);
    assert.ok("children" in node);
    assert.ok("children" in node && node.children.length >= 2, preset.id);
  }
});
