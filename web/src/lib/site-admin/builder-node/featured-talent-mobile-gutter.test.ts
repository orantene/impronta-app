import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeaturedTalentDecomposedSection,
  gridOnlyFeaturedTalentConfig,
} from "./featured-talent-freeform";

/**
 * The other half of the phone fix (see featured-talent.css): the wrapper this
 * builder emits carried 40px side padding with NO mobile override, which on a
 * 375px screen is 21% of the width gone before any content — and it stacked
 * with the section's own inset until the card rail was 207px wide showing
 * 262px cards.
 */
test("the section wrapper drops its desktop gutter on phones", () => {
  const node = buildFeaturedTalentDecomposedSection({
    rootId: "t",
    eyebrow: "Selected",
    headline: "Featured",
    subheadline: "",
    seeAllLabel: "All",
    seeAllHref: "/directory",
    embedConfig: gridOnlyFeaturedTalentConfig({ limit: 4 }),
  });

  const wrappers: Array<Record<string, unknown>> = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const node = n as Record<string, unknown>;
    const style = (node.props as { style?: Record<string, unknown> } | undefined)?.style;
    if (style && style.paddingLeft === "40px") wrappers.push(style);
    Object.values(node).forEach(walk);
  };
  walk(node);

  assert.equal(wrappers.length, 1, "expected exactly one 40px-gutter wrapper");
  const responsive = wrappers[0]!.responsive as { mobile?: Record<string, string> } | undefined;
  assert.ok(responsive?.mobile, "the wrapper must carry a mobile lane");
  assert.equal(responsive.mobile.paddingLeft, "16px");
  assert.equal(responsive.mobile.paddingRight, "16px");
});
