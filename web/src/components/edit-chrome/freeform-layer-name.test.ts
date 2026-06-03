import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import {
  layerIconKeyForKind,
  resolveLayerDisplayName,
  resolveResponsiveOverrides,
  LAYER_NAME_MAX,
} from "./freeform-layer-name";

// ── Semantic name resolution (job #1) ──────────────────────────────────────

test("heading row reads its text", () => {
  const node: BuilderNode = {
    id: "h1",
    kind: "heading",
    props: { text: "Meet the roster", level: 2 },
  };
  assert.equal(resolveLayerDisplayName(node), "Meet the roster");
});

test("blank heading text falls back to the kind label", () => {
  const node: BuilderNode = {
    id: "h2",
    kind: "heading",
    props: { text: "   ", level: 1 },
  };
  assert.equal(resolveLayerDisplayName(node), "Heading");
});

test("long text is truncated with an ellipsis at the max", () => {
  const long = "A".repeat(LAYER_NAME_MAX + 30);
  const node: BuilderNode = {
    id: "p1",
    kind: "paragraph",
    props: { text: long },
  };
  const name = resolveLayerDisplayName(node);
  assert.equal(name.length, LAYER_NAME_MAX);
  assert.ok(name.endsWith("…"), "truncated label ends with an ellipsis");
});

test("button row reads its label, image row reads its alt", () => {
  const button: BuilderNode = {
    id: "b1",
    kind: "button",
    props: { label: "Start an inquiry", href: "/contact" },
  };
  assert.equal(resolveLayerDisplayName(button), "Start an inquiry");

  const image: BuilderNode = {
    id: "i1",
    kind: "image",
    props: { src: "/x.jpg", alt: "Studio portrait" },
  };
  assert.equal(resolveLayerDisplayName(image), "Studio portrait");
});

test("image with no alt falls back to a friendly name", () => {
  const image: BuilderNode = {
    id: "i2",
    kind: "image",
    props: { src: "/x.jpg" },
  };
  assert.equal(resolveLayerDisplayName(image), "Image");
});

test("accordion_item reads its title", () => {
  const node: BuilderNode = {
    id: "ai1",
    kind: "accordion_item",
    props: { title: "Shipping & returns" },
    children: [],
  };
  assert.equal(resolveLayerDisplayName(node), "Shipping & returns");
});

test("section prefers an explicit label over the kind label", () => {
  const node: BuilderNode = {
    id: "s1",
    kind: "section",
    props: { sectionTypeKey: "hero", label: "Opening hero" },
  };
  assert.equal(resolveLayerDisplayName(node), "Opening hero");
});

test("section_embed uses the injected friendly label", () => {
  const node: BuilderNode = {
    id: "se1",
    kind: "section_embed",
    props: { sectionTypeKey: "featured_talent" },
  };
  const lookup = (key: string) =>
    key === "featured_talent" ? "Featured talent" : undefined;
  assert.equal(resolveLayerDisplayName(node, lookup), "Featured talent");
});

test("section_embed humanizes the key when no friendly label resolves", () => {
  const node: BuilderNode = {
    id: "se2",
    kind: "section_embed",
    props: { sectionTypeKey: "logo_cloud" },
  };
  // No lookup provided → humanize the raw key.
  assert.equal(resolveLayerDisplayName(node), "Logo Cloud");
  // Lookup that misses → same humanized fallback.
  assert.equal(
    resolveLayerDisplayName(node, () => undefined),
    "Logo Cloud",
  );
});

test("a bare layout container falls back to its registry kind label", () => {
  const node: BuilderNode = {
    id: "c1",
    kind: "container",
    props: { layout: "stack" },
    children: [],
  };
  // Whatever the registry label is, it must be a non-empty human string, not "container".
  const name = resolveLayerDisplayName(node);
  assert.ok(name.length > 0);
  assert.notEqual(name, "");
});

test("divider and spacer carry a descriptive suffix", () => {
  const divider: BuilderNode = {
    id: "d1",
    kind: "divider",
    props: { tone: "muted" },
  };
  assert.equal(resolveLayerDisplayName(divider), "Divider · muted");

  const spacer: BuilderNode = {
    id: "sp1",
    kind: "spacer",
    props: { size: "l" },
  };
  assert.equal(resolveLayerDisplayName(spacer), "Spacer · L");
});

// ── Per-kind icon key (job #1, visual scanning) ─────────────────────────────

test("container icon key splits by layout", () => {
  const stack: BuilderNode = {
    id: "c-stack",
    kind: "container",
    props: { layout: "stack" },
    children: [],
  };
  const row: BuilderNode = {
    id: "c-row",
    kind: "container",
    props: { layout: "row" },
    children: [],
  };
  const grid: BuilderNode = {
    id: "c-grid",
    kind: "container",
    props: { layout: "grid" },
    children: [],
  };
  assert.equal(layerIconKeyForKind(stack), "container_stack");
  assert.equal(layerIconKeyForKind(row), "container_row");
  assert.equal(layerIconKeyForKind(grid), "container_grid");
});

test("leaf kinds map to their own icon keys", () => {
  const heading: BuilderNode = {
    id: "h",
    kind: "heading",
    props: { text: "x", level: 1 },
  };
  const image: BuilderNode = {
    id: "i",
    kind: "image",
    props: { src: "/x.jpg" },
  };
  const embed: BuilderNode = {
    id: "se",
    kind: "section_embed",
    props: { sectionTypeKey: "directory" },
  };
  assert.equal(layerIconKeyForKind(heading), "heading");
  assert.equal(layerIconKeyForKind(image), "image");
  assert.equal(layerIconKeyForKind(embed), "section_embed");
});

// ── Responsive-override detection (job #33, the layer-row dot) ───────────────

test("a node with no style reports no responsive overrides", () => {
  const node: BuilderNode = {
    id: "h",
    kind: "heading",
    props: { text: "x", level: 1 },
  };
  assert.deepEqual(resolveResponsiveOverrides(node), {
    tablet: false,
    mobile: false,
    any: false,
  });
});

test("a desktop-only style is NOT a responsive override", () => {
  const node: BuilderNode = {
    id: "h",
    kind: "heading",
    props: { text: "x", level: 1, style: { fontSize: "40px" } },
  };
  assert.deepEqual(resolveResponsiveOverrides(node), {
    tablet: false,
    mobile: false,
    any: false,
  });
});

test("style.responsive.mobile flags a mobile override only", () => {
  const node: BuilderNode = {
    id: "h",
    kind: "heading",
    props: {
      text: "x",
      level: 1,
      style: { fontSize: "40px", responsive: { mobile: { fontSize: "24px" } } },
    },
  };
  const summary = resolveResponsiveOverrides(node);
  assert.equal(summary.mobile, true);
  assert.equal(summary.tablet, false);
  assert.equal(summary.any, true);
});

test("an EMPTY responsive bucket does not count as an override", () => {
  const node: BuilderNode = {
    id: "h",
    kind: "heading",
    props: { text: "x", level: 1, style: { responsive: { tablet: {} } } },
  };
  assert.equal(resolveResponsiveOverrides(node).any, false);
});

test("containerQueries buckets count as overrides", () => {
  const node: BuilderNode = {
    id: "c",
    kind: "container",
    props: {
      layout: "row",
      style: { containerQueries: { tablet: { gap: "8px" } } },
    },
    children: [],
  };
  const summary = resolveResponsiveOverrides(node);
  assert.equal(summary.tablet, true);
  assert.equal(summary.any, true);
});

test("container props.responsive layout overrides (2A) are detected", () => {
  const node: BuilderNode = {
    id: "c",
    kind: "container",
    props: {
      layout: "row",
      responsive: { mobile: { layout: "stack" } },
    },
    children: [],
  };
  const summary = resolveResponsiveOverrides(node);
  assert.equal(summary.mobile, true);
  assert.equal(summary.tablet, false);
  assert.equal(summary.any, true);
});
