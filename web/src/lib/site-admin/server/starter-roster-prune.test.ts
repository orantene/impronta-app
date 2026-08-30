/**
 * Seed-time roster prune — same predicate as the legacy slot seed.
 *
 * Mutation-checked: deleting `isFeaturedTalentDecomposedRoot` (or skipping the
 * audience gate) makes the business case fail. A tree with no featured nodes
 * must come back by reference so "unchanged" is an identity check.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { buildFeaturedTalentDecomposedSection } from "@/lib/site-admin/builder-node/featured-talent-freeform";

import { starterAudienceHasRoster } from "./onboard-starter-content-entries";
import { pruneStarterRosterForAudience } from "./starter-roster-prune";

const HERO: BuilderNode = {
  id: "hero",
  kind: "heading",
  props: { text: "Come see what we do.", level: 1 },
};

const FEATURED = buildFeaturedTalentDecomposedSection({
  rootId: "featured-root",
  headline: "FEATURED TALENT",
});

const TREE: BuilderNodeTree = [HERO, FEATURED];

function treeHasFeatured(tree: BuilderNodeTree): boolean {
  const walk = (node: BuilderNode): boolean => {
    if (
      node.kind === "section_embed" &&
      node.props.sectionTypeKey === "featured_talent"
    ) {
      return true;
    }
    return (node.children ?? []).some(walk);
  };
  return tree.some(walk);
}

describe("pruneStarterRosterForAudience", () => {
  it("reuses starterAudienceHasRoster: only business drops the showcase", () => {
    assert.equal(starterAudienceHasRoster("agency"), true);
    assert.equal(starterAudienceHasRoster("organization"), true);
    assert.equal(starterAudienceHasRoster("operator"), true);
    assert.equal(starterAudienceHasRoster("business"), false);
  });

  it("returns the same reference when the audience keeps a roster", () => {
    assert.equal(pruneStarterRosterForAudience(TREE, "agency"), TREE);
    assert.equal(pruneStarterRosterForAudience(TREE, "organization"), TREE);
    assert.equal(pruneStarterRosterForAudience(TREE, "operator"), TREE);
  });

  it("returns the same reference when audience is unknown (render fallback)", () => {
    assert.equal(pruneStarterRosterForAudience(TREE, undefined), TREE);
    assert.equal(pruneStarterRosterForAudience(TREE, null), TREE);
    assert.equal(pruneStarterRosterForAudience(TREE, ""), TREE);
  });

  it("drops the decomposed featured section for a business audience", () => {
    const next = pruneStarterRosterForAudience(TREE, "business");
    assert.notEqual(next, TREE);
    assert.equal(next.length, 1);
    assert.equal(next[0], HERO);
    assert.equal(treeHasFeatured(next), false);
  });

  it("drops a bare featured_talent embed even without the factory layerLabel", () => {
    const embed: BuilderNode = {
      id: "embed",
      kind: "section_embed",
      props: { sectionTypeKey: "featured_talent" },
    };
    const next = pruneStarterRosterForAudience([HERO, embed], "business");
    assert.deepEqual(next, [HERO]);
  });

  it("returns the same reference when there is nothing to drop", () => {
    const justHero: BuilderNodeTree = [HERO];
    assert.equal(pruneStarterRosterForAudience(justHero, "business"), justHero);
  });
});
