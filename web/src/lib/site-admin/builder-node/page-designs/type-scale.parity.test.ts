/**
 * STYLE-3 — parity proof: the platform-default talent profile and the storefront
 * default page-design read the SAME shared storefront-grade type scale.
 *
 * The assertion is structural, not "the numbers happen to match": both surfaces
 * spread the exact tier objects exported from `type-scale.ts`, so a tier's
 * fontSize / responsive step-down appears verbatim in each surface's rendered
 * tree. If the talent default went back to inline px (or the storefront forked
 * its own scale), the shared values would stop appearing and this fails.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildDefaultTalentProfileTree } from "@/lib/talent-site/default-talent-tree";
import { improntaDesign } from "./impronta";
import {
  EYEBROW,
  HERO_NAME,
  SECTION_HEADING,
  STOREFRONT_TYPE_SCALE,
} from "./type-scale";
import type { BuilderNode } from "../types";

type StyleBag = Record<string, unknown>;

/** Collect every node's `style` bag (deep) across a tree. */
function collectStyles(node: unknown, out: StyleBag[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as BuilderNode;
  const props = (n as { props?: { style?: unknown } }).props;
  if (props && typeof props.style === "object" && props.style) {
    out.push(props.style as StyleBag);
  }
  if ("children" in n && Array.isArray(n.children)) {
    for (const c of n.children) collectStyles(c, out);
  }
}

function stylesOf(tree: BuilderNode[]): StyleBag[] {
  const out: StyleBag[] = [];
  for (const node of tree) collectStyles(node, out);
  return out;
}

/** True when some style bag has `key === value` (deep-equal). */
function someStyleHas(styles: StyleBag[], key: string, value: unknown): boolean {
  return styles.some(
    (s) => key in s && JSON.stringify(s[key]) === JSON.stringify(value),
  );
}

const talentStyles = stylesOf(buildDefaultTalentProfileTree());
const storefrontStyles = stylesOf(improntaDesign.tree);

test("the shared type scale is one object both surfaces import (referential identity)", () => {
  // HERO_NAME is the STYLE-2 display tier; the scale object aggregates them.
  assert.equal(STOREFRONT_TYPE_SCALE.heroName, HERO_NAME);
  assert.equal(STOREFRONT_TYPE_SCALE.sectionHeading, SECTION_HEADING);
  assert.equal(STOREFRONT_TYPE_SCALE.eyebrow, EYEBROW);
  // The display tier carries the storefront-grade hero size + responsive lift.
  assert.equal(HERO_NAME.fontSize, "72px");
  assert.deepEqual(HERO_NAME.responsive, {
    tablet: { fontSize: "54px" },
    mobile: { fontSize: "38px" },
  });
});

test("talent default profile binds heading/body to the SHARED type scale (not inline px)", () => {
  // Hero name → shared display/hero-name tier (72px + tablet/mobile step-downs).
  assert.ok(
    someStyleHas(talentStyles, "fontSize", HERO_NAME.fontSize),
    "talent hero name must use the shared hero-name fontSize",
  );
  assert.ok(
    someStyleHas(talentStyles, "responsive", HERO_NAME.responsive),
    "talent hero name must carry the shared display responsive step-downs",
  );
  // Section headings (Services / Gallery / Contact) → shared section-heading tier.
  assert.ok(
    someStyleHas(talentStyles, "fontSize", SECTION_HEADING.fontSize),
    "talent section headings must use the shared section-heading fontSize",
  );
  assert.ok(
    someStyleHas(talentStyles, "responsive", SECTION_HEADING.responsive),
    "talent section headings must carry the shared section-heading step-down",
  );
  // Eyebrow tier shared 12px size.
  assert.ok(
    someStyleHas(talentStyles, "fontSize", EYEBROW.fontSize),
    "talent eyebrow must use the shared eyebrow fontSize",
  );
});

test("storefront default reads the SAME shared type scale (eyebrow + section heading)", () => {
  // Section title size + responsive step-down come from the shared tier.
  assert.ok(
    someStyleHas(storefrontStyles, "fontSize", SECTION_HEADING.fontSize),
    "storefront section title must use the shared section-heading fontSize",
  );
  assert.ok(
    someStyleHas(storefrontStyles, "responsive", SECTION_HEADING.responsive),
    "storefront section title must carry the shared section-heading step-down",
  );
  // Eyebrow size from the shared tier.
  assert.ok(
    someStyleHas(storefrontStyles, "fontSize", EYEBROW.fontSize),
    "storefront eyebrow must use the shared eyebrow fontSize",
  );
});

test("PARITY — talent profile + storefront share the section-heading + eyebrow sizes from ONE source", () => {
  // The cross-surface invariant: the section-heading and eyebrow font sizes that
  // appear on BOTH surfaces are the SAME values, sourced from type-scale.ts. A
  // surface forking its own scale would break this (its size would no longer
  // equal the shared tier's).
  for (const tier of [SECTION_HEADING, EYEBROW]) {
    assert.ok(
      someStyleHas(talentStyles, "fontSize", tier.fontSize),
      `talent default missing shared tier fontSize ${tier.fontSize}`,
    );
    assert.ok(
      someStyleHas(storefrontStyles, "fontSize", tier.fontSize),
      `storefront default missing shared tier fontSize ${tier.fontSize}`,
    );
  }
});
