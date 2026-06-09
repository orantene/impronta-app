import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildLocationDiscoveryDecomposedSection,
  gridOnlyLocationDiscoveryConfig,
} from "./location-discovery-freeform";
import type { BuilderNode } from "./types";

function childNodes(node: BuilderNode | undefined): BuilderNode[] {
  return node?.kind === "container" ? (node.children ?? []) : [];
}

describe("location-discovery-freeform", () => {
  test("decomposed section exposes freeform text layers and grid-only embed", () => {
    const root = buildLocationDiscoveryDecomposedSection({ rootId: "ld-root" });
    assert.equal(root.kind, "container");
    assert.equal(root.id, "ld-root");
    assert.equal(root.props.layerLabel, "Markets Section");

    const column = childNodes(root)[0];
    assert.equal(column?.kind, "container");
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.deepEqual(labels, [
      "Intro Text",
      "Section Head",
      "Markets Grid",
    ]);

    const embed = childNodes(column).find((c) => c.kind === "section_embed");
    assert.ok(embed);
    const config = (embed!.props as { config?: Record<string, unknown> }).config;
    assert.equal(config?.eyebrow, "");
    assert.equal(config?.headline, "");
    assert.equal(config?.subheadline, "");
    assert.equal(config?.headless, true);
  });

  test("optional Subtitle layer appears when subheadline is non-empty", () => {
    const root = buildLocationDiscoveryDecomposedSection({
      rootId: "ld-sub",
      subheadline: "Starting with Riviera Maya.",
    });
    const column = childNodes(root)[0];
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.ok(labels.includes("Subtitle"), "Subtitle layer present");
  });

  test("Subtitle layer absent when subheadline is empty string", () => {
    const root = buildLocationDiscoveryDecomposedSection({
      rootId: "ld-nosub",
      subheadline: "",
    });
    const column = childNodes(root)[0];
    const labels = childNodes(column).map(
      (child) => (child.props as { layerLabel?: string }).layerLabel,
    );
    assert.ok(!labels.includes("Subtitle"), "Subtitle layer absent when empty");
  });

  test("Section Head contains Title and See All Link", () => {
    const root = buildLocationDiscoveryDecomposedSection({
      rootId: "ld-head",
      headline: "Local faces, international reach.",
      seeAllLabel: "Browse the directory",
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

  test("gridOnlyLocationDiscoveryConfig blanks SectionHead fields and sets headless", () => {
    const config = gridOnlyLocationDiscoveryConfig({
      eyebrow: "Talent network",
      headline: "Local faces, international reach.",
      subheadline: "Starting with Riviera Maya.",
      ctaLabel: "Browse the directory",
      ctaHref: "/directory",
      source: "manual",
      showMap: true,
      items: [{ label: "Riviera Maya", href: "/directory" }],
    });
    assert.equal(config.eyebrow, "");
    assert.equal(config.headline, "");
    assert.equal(config.subheadline, "");
    assert.equal(config.ctaLabel, "");
    assert.equal(config.ctaHref, undefined);
    assert.equal(config.headless, true);
    // Non-head config preserved
    assert.equal(config.source, "manual");
    assert.equal(config.showMap, true);
    assert.ok(Array.isArray(config.items), "items array preserved");
  });

  test("gridOnlyLocationDiscoveryConfig works with no base config", () => {
    const config = gridOnlyLocationDiscoveryConfig();
    assert.equal(config.headless, true);
    assert.equal(config.eyebrow, "");
    assert.equal(config.headline, "");
    assert.equal(config.subheadline, "");
  });

  test("embed section type is location_discovery", () => {
    const root = buildLocationDiscoveryDecomposedSection({ rootId: "ld-type" });
    const column = childNodes(root)[0];
    const embed = childNodes(column).find((c) => c.kind === "section_embed");
    assert.ok(embed);
    const sectionTypeKey = (embed!.props as { sectionTypeKey?: string }).sectionTypeKey;
    assert.equal(sectionTypeKey, "location_discovery");
  });
});
