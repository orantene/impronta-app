import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateSectionProps } from "@/lib/site-admin/forms/sections";
import {
  builderTreeHasH1,
  defaultShellProps,
  withShellDefaults,
} from "./shell-default-props";

describe("TUL-76 new site publish validation", () => {
  it("onboarding-style shell anchors validate (brand = business name, legal default)", () => {
    for (const type of ["site_header", "site_footer"]) {
      const props = defaultShellProps(type, "Fresh Studio");
      assert.equal(validateSectionProps(type, 1, props).ok, true);
    }
    assert.equal((defaultShellProps("site_footer", "Fresh Studio").brand as { label: string }).label, "Fresh Studio");
  });

  it("legacy anchors with empty props are healed, not blocked", () => {
    assert.equal(validateSectionProps("site_footer", 1, {}).ok, false);
    for (const type of ["site_header", "site_footer"]) {
      assert.equal(validateSectionProps(type, 1, withShellDefaults(type, {})).ok, true);
    }
  });

  it("keeps owner-set values when healing", () => {
    const healed = withShellDefaults("site_footer", { brand: { label: "Mine" } });
    assert.equal((healed.brand as { label: string }).label, "Mine");
  });

  it("after editing the hero headline the tree still has an H1 (carousel hero slide)", () => {
    const tree = [
      { kind: "carousel", props: { variant: "hero" }, children: [
        { kind: "container", props: {}, children: [{ kind: "heading", props: { level: 1, text: "New headline" } }] },
      ] },
    ];
    assert.equal(builderTreeHasH1(tree), true);
    assert.equal(builderTreeHasH1([{ kind: "heading", props: { level: 2, text: "x" } }]), false);
  });

  // Real workspace-site shape (composeSiteFromBrief): shared-content hero carousel, no heading node.
  const carouselHero = (sharedContent: Record<string, unknown>, extra: Record<string, unknown> = {}) => [
    { kind: "carousel", props: { variant: "hero", contentMode: "shared", sharedContent, ...extra }, children: [
      { kind: "container", props: {}, children: [] },
      { kind: "container", props: {}, children: [] },
      { kind: "container", props: {}, children: [] },
    ] },
  ];
  const content = { eyebrow: "Lash studio", headingLead: "QA Lash Studio Test", sub: "s", primaryCta: { label: "Book", href: "#" } };

  it("counts a shared-content hero carousel headline as the H1 (TUL-76)", () => {
    assert.equal(builderTreeHasH1(carouselHero(content)), true);
    assert.equal(builderTreeHasH1(carouselHero({ headingAccent: "Studio" })), true);
    assert.equal(builderTreeHasH1(carouselHero({ headingLead: "\u200b ", headingAccent: "Studio" })), true);
  });

  it("does not count empty shared content or a non-hero carousel", () => {
    assert.equal(builderTreeHasH1(carouselHero({ eyebrow: "x", sub: "y" })), false);
    assert.equal(builderTreeHasH1(carouselHero({ headingLead: " \u200b" })), false);
    assert.equal(builderTreeHasH1(carouselHero(content, { variant: "gallery" })), false);
  });

  it("keeps per-slide carousel heroes on their slide headings", () => {
    const slide = (h: Record<string, unknown>) => [{ kind: "carousel", props: { variant: "hero", contentMode: "per-slide" }, children: [
      { kind: "container", props: {}, children: [{ kind: "heading", props: { level: 1, ...h } }] },
    ] }];
    assert.equal(builderTreeHasH1(slide({ text: "Hi" })), true);
    assert.equal(builderTreeHasH1(slide({ text: "" })), false);
  });

  it("counts hero_search headline", () => {
    assert.equal(builderTreeHasH1([{ kind: "hero_search", props: { headline: "Find talent" } }]), true);
    assert.equal(builderTreeHasH1([{ kind: "hero_search", props: { headline: "" } }]), false);
  });

  const nested = (heading: Record<string, unknown>) => [
    { kind: "split", props: {}, children: [
      { kind: "container", props: {}, children: [{ kind: "heading", props: { level: 1, ...heading } }] },
    ] },
  ];

  it("counts live-text and field-bound headings, still fails without an H1", () => {
    assert.equal(builderTreeHasH1(nested({ text: "", liveText: "hero_headline" })), true);
    assert.equal(builderTreeHasH1(nested({ text: "", fieldBindings: { text: "displayName" } })), true);
    assert.equal(builderTreeHasH1(nested({ text: "  \u200b" })), false);
    assert.equal(builderTreeHasH1(nested({ text: "x", level: 2 })), false);
    assert.equal(builderTreeHasH1([]), false);
  });
});
