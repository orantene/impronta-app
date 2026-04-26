/**
 * Phase 11 — section blueprints.
 *
 * For each section type, a small set of "shape" presets the operator can
 * apply with one click. Different from `default-content.ts` (which is the
 * single create-time payload): blueprints are alternative layouts you can
 * snap an existing section into, and the inspector exposes them as a
 * "Layout blueprints" row.
 *
 * Each blueprint patches a partial set of props on top of whatever the
 * section currently has — fields the blueprint doesn't mention stay
 * untouched. Operators preview them visually and pick one; the section's
 * props are updated locally and persist via the standard Save draft path.
 *
 * Coverage: the most-used types get 3-5 blueprints. Less-used types fall
 * back to `default-content.ts` only — no blueprint row appears in the
 * inspector for them.
 *
 * IMPORTANT: every blueprint's `props` keys MUST exist in the section's
 * Zod schema, otherwise upsertSection will reject the merged object on
 * Save. Each entry below was reconciled against the live schema.
 */

export interface SectionBlueprint {
  /** Stable slug used in audit + analytics. */
  slug: string;
  /** Operator-facing label. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** Tiny SVG glyph hint shown in the picker — optional. */
  thumbHint?: "stack" | "grid" | "split" | "centered" | "wide" | "marquee";
  /** Partial props to merge into the section. */
  props: Record<string, unknown>;
}

/* hero — schema fields used: mood, overlay */
const HERO_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "hero-editorial",
    label: "Editorial mood",
    description: "Serif display + soft vignette overlay. Generous whitespace.",
    thumbHint: "centered",
    props: { mood: "editorial", overlay: "soft-vignette" },
  },
  {
    slug: "hero-cinematic",
    label: "Cinematic",
    description: "Oversized type with a gradient scrim. Pairs with multi-slide.",
    thumbHint: "wide",
    props: { mood: "cinematic", overlay: "gradient-scrim" },
  },
  {
    slug: "hero-clean",
    label: "Clean / aurora",
    description: "Compact rhythm + tenant-tinted aurora wash.",
    thumbHint: "centered",
    props: { mood: "clean", overlay: "aurora" },
  },
];

/* cta_banner — schema fields used: variant, imageSide, bandTone */
const CTA_BANNER_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "cta-centered-overlay",
    label: "Centered overlay",
    description: "Photo backdrop with copy floated centre — high impact.",
    thumbHint: "centered",
    props: { variant: "centered-overlay" },
  },
  {
    slug: "cta-split-image-right",
    label: "Split — image right",
    description: "Two-column with imagery on the right, copy on the left.",
    thumbHint: "split",
    props: { variant: "split-image", imageSide: "right" },
  },
  {
    slug: "cta-split-image-left",
    label: "Split — image left",
    description: "Mirror of split-right, useful for alternating page rhythm.",
    thumbHint: "split",
    props: { variant: "split-image", imageSide: "left" },
  },
  {
    slug: "cta-minimal-ivory",
    label: "Minimal band — ivory",
    description: "Lightweight tonal band, no imagery — pairs with footer.",
    thumbHint: "wide",
    props: { variant: "minimal-band", bandTone: "ivory" },
  },
  {
    slug: "cta-minimal-espresso",
    label: "Minimal band — espresso",
    description: "Dark band variant; reads as a quiet closing punctuation.",
    thumbHint: "wide",
    props: { variant: "minimal-band", bandTone: "espresso" },
  },
];

/* faq_accordion — schema fields used: variant, defaultOpen */
const FAQ_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "faq-bordered",
    label: "Bordered",
    description: "Rule lines between rows — easiest to scan on long lists.",
    thumbHint: "stack",
    props: { variant: "bordered", defaultOpen: -1 },
  },
  {
    slug: "faq-minimal",
    label: "Minimal",
    description: "No rules, generous spacing — editorial feel.",
    thumbHint: "stack",
    props: { variant: "minimal", defaultOpen: -1 },
  },
  {
    slug: "faq-card-first-open",
    label: "Card · first open",
    description: "Each question in its own card; first row pre-expanded.",
    thumbHint: "grid",
    props: { variant: "card", defaultOpen: 0 },
  },
];

/* stats — schema fields used: variant, align */
const STATS_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "stats-row-center",
    label: "Centered row",
    description: "All metrics in a single row, centered. Best for 3-4 stats.",
    thumbHint: "wide",
    props: { variant: "row", align: "center" },
  },
  {
    slug: "stats-grid-start",
    label: "Grid",
    description: "Two-up grid, left-aligned. Works for 4-6 stats.",
    thumbHint: "grid",
    props: { variant: "grid", align: "start" },
  },
  {
    slug: "stats-split",
    label: "Split with copy",
    description: "Stats live in a side column next to a headline + intro.",
    thumbHint: "split",
    props: { variant: "split", align: "start" },
  },
];

/* testimonials_trio — schema fields used: variant */
const TESTIMONIALS_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "testimonials-trio-card",
    label: "Three cards",
    description: "Three quote cards side by side. Highest density.",
    thumbHint: "grid",
    props: { variant: "trio-card" },
  },
  {
    slug: "testimonials-single-hero",
    label: "Single hero",
    description: "One large pull-quote, centered, with attribution below.",
    thumbHint: "centered",
    props: { variant: "single-hero" },
  },
  {
    slug: "testimonials-carousel-row",
    label: "Carousel row",
    description: "Auto-scrolling row — works as a social-proof bar.",
    thumbHint: "marquee",
    props: { variant: "carousel-row" },
  },
];

/* featured_talent — schema fields used: variant */
const FEATURED_TALENT_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "featured-grid",
    label: "Grid",
    description: "Standard portrait grid with names + roles.",
    thumbHint: "grid",
    props: { variant: "grid" },
  },
  {
    slug: "featured-carousel",
    label: "Carousel",
    description: "Auto-scrolling row of cards. Good for >12 talent.",
    thumbHint: "marquee",
    props: { variant: "carousel" },
  },
];

/* gallery_strip — schema fields used: variant */
const GALLERY_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "gallery-mosaic",
    label: "Mosaic",
    description: "Mixed-aspect masonry — editorial feel.",
    thumbHint: "grid",
    props: { variant: "mosaic" },
  },
  {
    slug: "gallery-scroll-rail",
    label: "Scroll rail",
    description: "Horizontal scroll strip; thumbs stay edge-to-edge.",
    thumbHint: "wide",
    props: { variant: "scroll-rail" },
  },
  {
    slug: "gallery-grid-uniform",
    label: "Uniform grid",
    description: "Fixed-aspect grid; tidiest for product shots.",
    thumbHint: "grid",
    props: { variant: "grid-uniform" },
  },
];

/* pricing_grid — schema fields used: variant */
const PRICING_BLUEPRINTS: SectionBlueprint[] = [
  {
    slug: "pricing-cards",
    label: "Cards",
    description: "Filled tier cards with shadow lift on hover.",
    thumbHint: "grid",
    props: { variant: "cards" },
  },
  {
    slug: "pricing-minimal",
    label: "Minimal",
    description: "No card chrome, tier columns separated by whitespace only.",
    thumbHint: "grid",
    props: { variant: "minimal" },
  },
  {
    slug: "pricing-bordered",
    label: "Bordered",
    description: "Light rule between tiers — works on tinted backdrops.",
    thumbHint: "grid",
    props: { variant: "bordered" },
  },
];

export const SECTION_BLUEPRINTS: Partial<
  Record<string, ReadonlyArray<SectionBlueprint>>
> = {
  hero: HERO_BLUEPRINTS,
  cta_banner: CTA_BANNER_BLUEPRINTS,
  faq_accordion: FAQ_BLUEPRINTS,
  stats: STATS_BLUEPRINTS,
  testimonials_trio: TESTIMONIALS_BLUEPRINTS,
  featured_talent: FEATURED_TALENT_BLUEPRINTS,
  gallery_strip: GALLERY_BLUEPRINTS,
  pricing_grid: PRICING_BLUEPRINTS,
};

export function getBlueprintsFor(
  sectionTypeKey: string,
): ReadonlyArray<SectionBlueprint> {
  return SECTION_BLUEPRINTS[sectionTypeKey] ?? [];
}
