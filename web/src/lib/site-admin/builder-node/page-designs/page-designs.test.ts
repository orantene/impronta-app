import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BUILDER_NODE_COMPOSITION_PRESETS,
  createBuilderNodeCompositionPreset,
} from "../composition-presets";
import { renderBuilderNodes } from "../render";
import type { BuilderNode } from "../types";
import {
  PAGE_DESIGN_PHOTOS,
  PAGE_DESIGNS,
  bakePageDesignTree,
  expandBuilderRepeaters,
} from "./index";

function renderTree(
  tree: BuilderNode[],
  dataSources?: Parameters<typeof bakePageDesignTree>[1],
): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(tree, { mode: "freeform", dataSources }),
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

// The bake deliberately drops the repeater `dataBinding`, so the baked container
// no longer emits the live-data marker attributes. Strip those before comparing
// VISIBLE output — everything a user sees must be pixel-identical.
function stripDataBindingMarkers(html: string): string {
  return html.replace(/ data-builder-data-(?:source|mode|max-items)="[^"]*"/g, "");
}

function collectIds(nodes: BuilderNode[]): string[] {
  const ids: string[] = [];
  const walk = (node: BuilderNode) => {
    ids.push(node.id);
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return ids;
}

test("page-designs: five single-root container designs with copy", () => {
  assert.equal(PAGE_DESIGNS.length, 5);
  for (const design of PAGE_DESIGNS) {
    assert.equal(design.tree.length, 1, `${design.id} must be a single root`);
    assert.equal(design.tree[0]?.kind, "container", `${design.id} root kind`);
    assert.ok(design.label.length > 0, `${design.id} label`);
    assert.ok(design.description.length > 0, `${design.id} description`);
  }
});

test("page-designs: baking repeaters renders visibly-identical HTML to the live repeat path", () => {
  for (const design of PAGE_DESIGNS) {
    const live = renderTree(design.tree, design.dataSources);
    // self-contained — repeaters baked to static children, no inline collections
    const baked = renderTree(
      expandBuilderRepeaters(design.tree, design.dataSources),
      undefined,
    );
    assert.equal(
      stripDataBindingMarkers(baked),
      stripDataBindingMarkers(live),
      `${design.id} baked output diverged from the live repeat render`,
    );
  }
});

test("page-designs: baked trees have collision-free ids across repeated inserts", () => {
  for (const design of PAGE_DESIGNS) {
    const a = collectIds(bakePageDesignTree(design.tree, design.dataSources));
    const b = collectIds(bakePageDesignTree(design.tree, design.dataSources));
    assert.equal(new Set(a).size, a.length, `${design.id} has duplicate ids`);
    assert.ok(
      !a.some((id) => b.includes(id)),
      `${design.id} two inserts share an id`,
    );
  }
});

test("page-designs: every photo resolves to a real file under public/", () => {
  for (const [key, path] of Object.entries(PAGE_DESIGN_PHOTOS)) {
    const absolute = resolve(process.cwd(), `public${path}`);
    assert.ok(existsSync(absolute), `${key} -> public${path} missing`);
  }
});

test("page-designs: each archetype is a pickable full-page composition preset", () => {
  const pagePresets = BUILDER_NODE_COMPOSITION_PRESETS.filter(
    (preset) => preset.category === "page",
  );
  assert.equal(pagePresets.length, 5);
  for (const preset of pagePresets) {
    assert.equal(preset.rootKind, "container", `${preset.id} rootKind`);
    const node = createBuilderNodeCompositionPreset(preset.id);
    assert.equal(node.kind, "container", `${preset.id} baked root kind`);
  }
});
