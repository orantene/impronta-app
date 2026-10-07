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
});
