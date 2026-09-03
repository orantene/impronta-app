import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildFeaturedTalentDecomposedSection,
  gridOnlyFeaturedTalentConfig,
} from "./featured-talent-freeform";
import type { BuilderNode } from "./types";

function childNodes(node: BuilderNode | undefined): BuilderNode[] {
  return node?.kind === "container" ? (node.children ?? []) : [];
}

describe("featured-talent-freeform", () => {
  test("decomposed section exposes freeform text layers and grid-only embed", () => {
    const root = buildFeaturedTalentDecomposedSection({ rootId: "ft-root" });
    assert.equal(root.kind, "container");
    assert.equal(root.id, "ft-root");
    assert.equal(root.props.layerLabel, "Featured Talent Section");

    const column = childNodes(root)[0];
    assert.equal(column?.kind, "container");
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.deepEqual(labels, [
      "Intro Text",
      "Section Head",
      "Talent Grid",
    ]);

    // Phase 8B — the grid is a NATIVE `featured_talent` node, not a
    // `section_embed` bridge, and it must carry NO head props: this wrapper's
    // own heading/paragraph/button layers are the section head, so a headline
    // on the grid would render the title twice.
    const grid = childNodes(column).find((c) => c.kind === "featured_talent");
    assert.ok(grid);
    assert.equal(
      childNodes(column).some((c) => c.kind === "section_embed"),
      false,
      "no section_embed bridge may survive in the featured-talent wrapper",
    );
    const props = grid!.props as Record<string, unknown>;
    assert.equal(props.headline, undefined);
    assert.equal(props.eyebrow, undefined);
    assert.equal(props.copy, undefined);
    // Legacy-only keys must not ride along: unknown props fail tree validation.
    assert.equal(props.headless, undefined);
    assert.equal(props.config, undefined);
    assert.equal(props.sectionTypeKey, undefined);
  });

  test("optional Subtitle layer appears when subheadline is non-empty", () => {
    const root = buildFeaturedTalentDecomposedSection({
      rootId: "ft-sub",
      subheadline: "Curated picks from the roster.",
    });
    const column = childNodes(root)[0];
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.ok(labels.includes("Subtitle"), "Subtitle layer present");
  });

  test("Subtitle layer absent when subheadline is empty string", () => {
    const root = buildFeaturedTalentDecomposedSection({
      rootId: "ft-nosub",
      subheadline: "",
    });
    const column = childNodes(root)[0];
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.ok(!labels.includes("Subtitle"), "Subtitle layer absent when empty");
  });

  test("Section Head contains Title and See All Link", () => {
    const root = buildFeaturedTalentDecomposedSection({
      rootId: "ft-head",
      headline: "FEATURED TALENT",
      seeAllLabel: "Explore Talent",
      seeAllHref: "/directory",
    });
    const column = childNodes(root)[0];
    const sectionHead = childNodes(column).find(
      (c) => (c.props as { layerLabel?: string }).layerLabel === "Section Head",
    );
    assert.ok(sectionHead, "Section Head found");
    const headChildren = childNodes(sectionHead);
    const titleNode = headChildren.find(
      (c) => (c.props as { layerLabel?: string }).layerLabel === "Title",
    );
    const seeAllNode = headChildren.find(
      (c) => (c.props as { layerLabel?: string }).layerLabel === "See All Link",
    );
    assert.ok(titleNode, "Title layer found");
    assert.equal(titleNode!.kind, "heading");
    assert.ok(seeAllNode, "See All Link layer found");
    assert.equal(seeAllNode!.kind, "button");
  });

  test("gridOnlyFeaturedTalentConfig blanks head fields and sets headless", () => {
    const config = gridOnlyFeaturedTalentConfig({
      eyebrow: "Selected",
      headline: "FEATURED TALENT",
      copy: "Some copy",
      footerCta: { href: "/directory", label: "Explore" },
      sourceMode: "manual_pick",
      limit: 6,
    });
    assert.equal(config.eyebrow, "");
    assert.equal(config.headline, "");
    assert.equal(config.copy, "");
    assert.equal(config.footerCta, undefined);
    assert.equal(config.headless, true);
    // Non-head config preserved
    assert.equal(config.sourceMode, "manual_pick");
    assert.equal(config.limit, 6);
  });

  test("gridOnlyFeaturedTalentConfig works with no base config", () => {
    const config = gridOnlyFeaturedTalentConfig();
    assert.equal(config.headless, true);
    assert.equal(config.eyebrow, "");
    assert.equal(config.headline, "");
    assert.equal(config.copy, "");
  });

  test("grid node is the NATIVE featured_talent kind, with a pinnable id", () => {
    const root = buildFeaturedTalentDecomposedSection({ rootId: "ft-type" });
    const column = childNodes(root)[0];
    const grid = childNodes(column).find((c) => c.kind === "featured_talent");
    assert.ok(grid);
    assert.equal(grid!.kind, "featured_talent");

    // The id is what `featuredTalentProfilesByNodeId` is keyed by, so a caller
    // must be able to pin it — a re-seed that minted a fresh uuid every run
    // would churn the published snapshot on every deploy.
    const pinned = buildFeaturedTalentDecomposedSection({
      rootId: "ft-type",
      gridNodeId: "rb-home-featured-grid",
    });
    const pinnedGrid = childNodes(childNodes(pinned)[0]).find(
      (c) => c.kind === "featured_talent",
    );
    assert.equal(pinnedGrid!.id, "rb-home-featured-grid");
  });

  test("manual_pick source config survives the projection onto native props", () => {
    // The regression this pins: the native node's cards are resolved from its
    // OWN `sourceMode` / `manualProfileCodes`. If the projection dropped them
    // the homepage's five named profiles would silently become the auto-flag
    // roster, which is a different set of people on a live agency site.
    const root = buildFeaturedTalentDecomposedSection({
      rootId: "ft-manual",
      embedConfig: gridOnlyFeaturedTalentConfig({
        sourceMode: "manual_pick",
        manualProfileCodes: ["TAL-00036", "TAL-00033"],
        limit: 4,
      }),
    });
    const grid = childNodes(childNodes(root)[0]).find(
      (c) => c.kind === "featured_talent",
    );
    const props = grid!.props as Record<string, unknown>;
    assert.equal(props.sourceMode, "manual_pick");
    assert.deepEqual(props.manualProfileCodes, ["TAL-00036", "TAL-00033"]);
    assert.equal(props.limit, 4);
  });
});
