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

  const maisonV2Hero = (heading: Record<string, unknown>) => [
    { kind: "split", props: {}, children: [
      { kind: "container", props: {}, children: [
        { kind: "paragraph", props: { text: "x" } },
        { kind: "heading", props: { level: 1, ...heading } },
      ] },
      { kind: "image", props: {} },
    ] },
  ];

  it("counts a Maison v2 hero heading bound to live text with empty text (TUL-76)", () => {
    assert.equal(builderTreeHasH1(maisonV2Hero({ text: "", liveText: "hero_headline" })), true);
    assert.equal(builderTreeHasH1(maisonV2Hero({ text: "\u200b", liveText: "hero_headline" })), true);
  });

  it("counts a field-bound or string-level hero heading", () => {
    assert.equal(builderTreeHasH1(maisonV2Hero({ text: "", fieldBindings: { text: "displayName" } })), true);
    assert.equal(builderTreeHasH1(maisonV2Hero({ text: "Hi", level: "1" })), true);
  });

  it("still fails with no h1 or an empty unbound h1", () => {
    assert.equal(builderTreeHasH1(maisonV2Hero({ text: "", level: 2, liveText: "hero_headline" })), false);
    assert.equal(builderTreeHasH1(maisonV2Hero({ text: "  \u200b" })), false);
    assert.equal(builderTreeHasH1([]), false);
  });
});
