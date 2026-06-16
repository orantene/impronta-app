import test from "node:test";
import assert from "node:assert/strict";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  PLATFORM_DEFAULT_STOREFRONT_SLUG,
  PLATFORM_DEFAULT_STOREFRONT_TREE,
} from "./default-storefront-tree";

function walk(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      walk(node.children, visit);
    }
  }
}

test("default storefront tree validates with no issues", () => {
  const result = validateBuilderNodeTree(PLATFORM_DEFAULT_STOREFRONT_TREE);
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues, null, 2));
});

test("default storefront tree has a single root container", () => {
  assert.equal(PLATFORM_DEFAULT_STOREFRONT_TREE.length, 1);
  assert.equal(PLATFORM_DEFAULT_STOREFRONT_TREE[0]!.kind, "container");
});

test("every node has a stable, unique, non-empty id", () => {
  const ids = new Set<string>();
  walk(PLATFORM_DEFAULT_STOREFRONT_TREE, (node) => {
    assert.equal(typeof node.id, "string");
    assert.ok(node.id.length > 0, "node id must be non-empty");
    assert.ok(!ids.has(node.id), `duplicate node id: ${node.id}`);
    ids.add(node.id);
  });
});

test("section containers carry NO container-level data binding (the embeds own the render)", () => {
  // Regression guard (review #1/#3): a container-level `featured_talent_profiles`
  // / `tenant_directory_search` binding makes the render path substitute its own
  // built-in live grid (a generic SEARCH BOX for the discipline block, a
  // degraded actionless card grid for featured) and silently DROP the curated
  // section embed. The default tree must rely on the embeds, so no container may
  // carry those bindings.
  walk(PLATFORM_DEFAULT_STOREFRONT_TREE, (node) => {
    if (node.kind === "container") {
      const key = node.props.dataBinding?.sourceKey;
      assert.notEqual(
        key,
        "featured_talent_profiles",
        `${node.id} must not bind featured_talent_profiles (it drops the curated embed)`,
      );
      assert.notEqual(
        key,
        "tenant_directory_search",
        `${node.id} must not bind tenant_directory_search (it renders a search box, not a card grid)`,
      );
    }
  });
});

test("discipline grid embed is dynamic (auto-derives disciplines from the tenant roster)", () => {
  // Regression guard (review #2/#4): talent_type_grid defaults to manual mode
  // with no items → an empty "No talent disciplines to show yet" grid. It must
  // be dynamic so it populates from THIS tenant's roster taxonomy.
  let disciplineMode: unknown;
  walk(PLATFORM_DEFAULT_STOREFRONT_TREE, (node) => {
    if (node.kind === "section_embed" && node.props.sectionTypeKey === "talent_type_grid") {
      disciplineMode = (node.props.config as { mode?: unknown } | undefined)?.mode;
    }
  });
  assert.equal(
    disciplineMode,
    "dynamic",
    "talent_type_grid embed must be mode:'dynamic' so it auto-populates from the roster",
  );
});

test("renders the curated featured-talent + discipline section embeds", () => {
  const embedKeys: string[] = [];
  walk(PLATFORM_DEFAULT_STOREFRONT_TREE, (node) => {
    if (node.kind === "section_embed") {
      embedKeys.push(node.props.sectionTypeKey);
    }
  });
  assert.ok(embedKeys.includes("featured_talent"));
  assert.ok(embedKeys.includes("talent_type_grid"));
});

test("hero has a full-bleed cover background image and two CTA buttons", () => {
  let heroBg: string | undefined;
  let buttonCount = 0;
  walk(PLATFORM_DEFAULT_STOREFRONT_TREE, (node) => {
    if (node.id === "default-storefront-hero" && node.kind === "container") {
      heroBg = node.props.style?.backgroundImage;
    }
    if (node.id.startsWith("default-storefront-hero-cta-") && node.kind === "button") {
      buttonCount += 1;
    }
  });
  assert.ok(heroBg && heroBg.includes("url("), "hero must paint a cover image");
  assert.equal(buttonCount, 2, "hero must have a primary + secondary CTA");
});

test("reserved slug is the platform default sentinel", () => {
  assert.equal(PLATFORM_DEFAULT_STOREFRONT_SLUG, "__platform_default_storefront__");
});
