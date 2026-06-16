import test from "node:test";
import assert from "node:assert/strict";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { computeDataBindingRequirements } from "@/lib/site-admin/builder-core/templates/registry-rows";
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

test("declares both connected data sources", () => {
  const requirements = computeDataBindingRequirements(PLATFORM_DEFAULT_STOREFRONT_TREE);
  assert.ok(
    requirements.includes("featured_talent_profiles"),
    "must bind featured_talent_profiles",
  );
  assert.ok(
    requirements.includes("tenant_directory_search"),
    "must bind tenant_directory_search",
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
