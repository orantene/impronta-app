/**
 * Sprint 4 — Smart section recommendations.
 *
 * Given the section types currently on the page, suggest up to N
 * section types the operator is most likely to want next. Used by the
 * section-picker popover to render a "Suggested" group above the full
 * library.
 *
 * Heuristics are intentionally explicit + auditable — no ML, no
 * server round-trip. Rule precedence (top to bottom; first match
 * wins, then we de-duplicate against currentTypes for non-stackable
 * types):
 *
 *   1. No hero anywhere → suggest hero first (every storefront page
 *      should anchor on an H1 hero).
 *   2. Has hero but no featured talent / category grid → suggest one
 *      of those (the "what we do / who we are" beat).
 *   3. Has hero + a content beat but no proof beat → suggest stats,
 *      testimonials_trio, or press_strip.
 *   4. Has 3+ sections but no closing CTA → suggest cta_banner.
 *   5. Otherwise → fall back to a default "popular" set
 *      (cta_banner, marquee, faq_accordion).
 *
 * Stackable types (cta_banner, marquee, gallery_strip) can appear in
 * multiple suggestions per page; non-stackable types (hero, featured
 * talent, etc.) are filtered out once they exist on the page.
 */

const STACKABLE_TYPES = new Set([
  "cta_banner",
  "marquee",
  "gallery_strip",
  "image_copy_alternating",
  "code_embed",
  "code_snippet",
  "anchor_nav",
]);

const HERO_TYPES = new Set(["hero", "hero_split", "blog_detail"]);

const CONTENT_BEAT_TYPES = new Set([
  "featured_talent",
  "category_grid",
  "destinations_mosaic",
  "split_screen",
  "magazine_layout",
  "image_copy_alternating",
  "team_grid",
  "pricing_grid",
  "process_steps",
  "values_trio",
  "content_tabs",
  "comparison_table",
]);

const PROOF_BEAT_TYPES = new Set([
  "stats",
  "testimonials_trio",
  "press_strip",
  "logo_cloud",
  "trust_strip",
]);

const CTA_TYPES = new Set(["cta_banner", "contact_form", "donation_form"]);

/**
 * @returns ordered list of section type keys, deduplicated against
 *          currentTypes (for non-stackable types). Up to `limit`
 *          entries.
 */
export function getSuggestedSections(
  currentTypes: ReadonlyArray<string>,
  limit = 3,
): string[] {
  const present = new Set(currentTypes);
  const suggestions: string[] = [];

  const push = (typeKey: string) => {
    if (suggestions.includes(typeKey)) return;
    if (!STACKABLE_TYPES.has(typeKey) && present.has(typeKey)) return;
    suggestions.push(typeKey);
  };

  // 1. No hero → suggest hero first.
  const hasHero = currentTypes.some((t) => HERO_TYPES.has(t));
  if (!hasHero) {
    push("hero");
  }

  // 2. Has hero but no content beat → suggest featured_talent first
  //    (most common "who we are" beat on agency / talent storefronts),
  //    fall back to category_grid.
  const hasContentBeat = currentTypes.some((t) => CONTENT_BEAT_TYPES.has(t));
  if (hasHero && !hasContentBeat) {
    push("featured_talent");
    push("category_grid");
  }

  // 3. Has content beat but no proof → suggest stats, testimonials, press.
  const hasProof = currentTypes.some((t) => PROOF_BEAT_TYPES.has(t));
  if (hasContentBeat && !hasProof) {
    push("stats");
    push("testimonials_trio");
    push("press_strip");
  }

  // 4. Has 3+ sections but no closing CTA → suggest cta_banner.
  const hasCta = currentTypes.some((t) => CTA_TYPES.has(t));
  if (currentTypes.length >= 3 && !hasCta) {
    push("cta_banner");
  }

  // 5. Fall through to default "popular" set.
  push("cta_banner");
  push("marquee");
  push("faq_accordion");
  push("gallery_strip");

  return suggestions.slice(0, limit);
}
