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

    const embed = childNodes(column).find((c) => c.kind === "section_embed");
    assert.ok(embed);
    const config = (embed!.props as { config?: Record<string, unknown> }).config;
    assert.equal(config?.headline, "");
    assert.equal(config?.eyebrow, "");
    assert.equal(config?.copy, "");
    assert.equal(config?.headless, true);
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

  test("embed section type is featured_talent", () => {
    const root = buildFeaturedTalentDecomposedSection({ rootId: "ft-type" });
    const column = childNodes(root)[0];
    const embed = childNodes(column).find((c) => c.kind === "section_embed");
    assert.ok(embed);
    const sectionTypeKey = (embed!.props as { sectionTypeKey?: string }).sectionTypeKey;
    assert.equal(sectionTypeKey, "featured_talent");
  });
});
