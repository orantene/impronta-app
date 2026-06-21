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
    node.kind === "divider" ||
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
    "divider",
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
    // A pack composes multiple sections, never a single fixed block. Some wrap
    // those sections in a single full-bleed band / max-width shell container
    // (marquee track, footer/featured inner wrapper), so look through ONE
    // wrapper level: the root has >=2 children, or its lone child does.
    const rootChildren = "children" in node ? node.children : [];
    const onlyChild = rootChildren.length === 1 ? rootChildren[0] : undefined;
    const effectiveChildren =
      onlyChild && "children" in onlyChild && Array.isArray(onlyChild.children)
        ? onlyChild.children
        : rootChildren;
    assert.ok(effectiveChildren.length >= 2, preset.id);
  }
});

test("marquee-ticker is a freeform ticker: a scroll track of editable word/separator nodes with keyframes in customCss", () => {
  const node = createBuilderNodeCompositionPreset("marquee-ticker");
  assert.equal(node.kind, "container");
  assert.ok("children" in node && node.children.length === 1);
  const track = "children" in node ? node.children[0] : undefined;
  const trackChildren =
    track && "children" in track && Array.isArray(track.children)
      ? track.children
      : [];
  // The track holds the items duplicated for the seamless loop — every word +
  // separator is its own editable node (never a fixed string).
  assert.ok(trackChildren.length >= 16, "track items");
  const words = trackChildren.filter((c) => c.kind === "heading");
  assert.ok(words.length >= 8, "editable word nodes");
  // EN/ES seeded at author time on every word.
  assert.ok(
    words.every((w) => w.i18n?.es?.text),
    "es overlay on every word",
  );
  // Marquee keyframes/animation live in the root customCss (8000-cap), never a
  // 120-cap transition/filter prop.
  const css = (node.props as { style?: { customCss?: string } }).style?.customCss ?? "";
  assert.match(css, /@keyframes/);
  assert.match(css, /animation:/);
  const valid = validateBuilderNodeTree([node]);
  assert.equal(valid.ok, true);
});

test("footer-editorial is a freeform site-shell footer: editable columns, EN/ES seeded, Tulala attribution locked", () => {
  const node = createBuilderNodeCompositionPreset("footer-editorial");
  assert.equal(node.kind, "container");
  // Root is a real <footer> wrapper that explodes into editable nodes.
  assert.equal(
    (node.props as { htmlTag?: string }).htmlTag,
    "footer",
    "root htmlTag",
  );
  // Collect every node so we can assert on the freeform tree.
  const all: { kind: string; i18n?: { es?: unknown }; lockedProps?: string[] }[] =
    [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as {
      kind?: string;
      i18n?: { es?: unknown };
      lockedProps?: string[];
      children?: unknown[];
    };
    if (node.kind) all.push(node as (typeof all)[number]);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(node);
  // Multiple nav columns + a social row = the real footer chrome, all editable.
  assert.ok(
    all.filter((n) => n.kind === "nav").length >= 3,
    "three+ editable nav columns",
  );
  assert.ok(
    all.some((n) => n.kind === "social_links"),
    "editable social row",
  );
  // "Powered by Tulala" attribution is read-only on tenant surfaces.
  const tulala = all.find(
    (n) => n.kind === "rich_text" && (n.lockedProps ?? []).includes("text"),
  );
  assert.ok(tulala, "locked Tulala attribution");
  // EN/ES seeded on the wordmark/tagline/eyebrows.
  assert.ok(
    all.filter((n) => n.i18n?.es).length >= 4,
    "es overlay across text nodes",
  );
  const valid = validateBuilderNodeTree([node]);
  assert.equal(valid.ok, true);
});

test("impronta-noir-home is a full-page template assembling every Noir section", () => {
  const node = createBuilderNodeCompositionPreset("impronta-noir-home");
  assert.equal(node.kind, "container");
  // Hero → marquee → featured → divisions → story → campaigns → stats →
  // testimonials → cta → footer = 10 top-level sections, each editable on drop.
  assert.ok(
    "children" in node && node.children.length === 10,
    "ten assembled sections",
  );
  // The whole page must pass the gallery-insert guard as one (deep) tree.
  const valid = validateBuilderNodeTree([node], { maxDepth: 16 });
  assert.equal(valid.ok, true);
  // Every id across the assembled page is unique — factories mint fresh ids, so
  // dropping the page never collides ids (or duplicate @keyframes names).
  const ids: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const cur = n as { id?: string; children?: unknown[] };
    if (cur.id) ids.push(cur.id);
    if (Array.isArray(cur.children)) cur.children.forEach(walk);
  };
  walk(node);
  assert.equal(ids.length, new Set(ids).size, "all node ids unique");
});
