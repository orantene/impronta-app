/**
 * STYLE-3 · The SHARED storefront-grade type scale — one source of truth.
 *
 * The premium page-design templates (the "storefront default") and the
 * platform-default talent profile (`default-talent-tree.ts`, also reused by the
 * Max-site DEFAULT_TEMPLATE) were each carrying their own hardcoded px font
 * sizes for the same conceptual tiers — hero name, section heading, eyebrow,
 * lead/intro paragraph. TMPL-2's "B5 typography lift" duplicated the
 * storefront's premium px values inline into the talent tree; the moment the
 * storefront scale moved, the two would silently diverge again.
 *
 * This module is the ONE place those tiers live. Both the storefront page-design
 * helpers and the talent default-tree builder import these constants, so the
 * default talent profile inherits storefront-grade typography from a single
 * shared scale rather than a copy. A change here propagates to every surface
 * that binds a tier — the parity is structural, not a coincidence of matching
 * numbers (see `type-scale.parity.test.ts`).
 *
 * ── Why px constants and not `token:typography.*` sentinels ──────────────────
 * The `token:typography.h{N}-size` bindings (style-token-bindings.ts) are the
 * PER-TENANT OVERRIDE channel — their fallback is `inherit`, so an unset tenant
 * gets no absolute size. This module is the ABSOLUTE platform-default scale the
 * premium designs ship with before any tenant override. A node can still be
 * re-bound to a tenant token in the inspector; this is the baseline both
 * surfaces start from. Keeping it as plain `BuilderNodeStyleValue` fragments
 * means the renderer emits the exact same CSS it did when the values were inline
 * (byte-stable: the talent tree's rendered output is unchanged vs TMPL-2).
 *
 * Pure data (no imports beyond the style type) so it is edge-safe and importable
 * from both the storefront page-designs and the talent-site default-tree module.
 */
import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";

/**
 * A type-scale tier: the base style fragment plus its responsive step-downs.
 * Spread into a node's `style` (`{ ...TYPE_SCALE.heroName, ...brandDeltas }`) so
 * a surface can layer brand-specific deltas (font family, colour, transform) on
 * top of the shared size/leading/tracking without forking the scale. Typed as
 * `BuilderNodeStyle` because the tiers carry `responsive` breakpoint step-downs,
 * which live on the full style (not the breakpoint-less `BuilderNodeStyleValue`).
 */
export type TypeScaleTier = BuilderNodeStyle;

/**
 * STYLE-2 display tier — the largest heading scale, above XL. The renderer also
 * understands `size: "display"` (render.tsx maps it to
 * `clamp(3.5rem,6vw,6rem)`); this fragment is the fixed-px equivalent used by
 * the default trees so the hero adopts the display tier with an explicit,
 * fidelity-stable size + leading rather than relying on the responsive clamp.
 * Mirrors the storefront premium hero display scale.
 */
export const DISPLAY: TypeScaleTier = {
  fontSize: "72px",
  lineHeight: "1.03",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  textWrap: "balance",
  responsive: {
    tablet: { fontSize: "54px" },
    mobile: { fontSize: "38px" },
  },
};

/**
 * Hero name / H1 tier. Currently identical to DISPLAY so the default talent hero
 * name renders at the storefront-grade display scale; kept as its own export so
 * a future H1 vs Display split changes only one tier.
 */
export const HERO_NAME: TypeScaleTier = DISPLAY;

/**
 * Section heading / H2 tier — the Services / Gallery / Contact headings on the
 * talent default and the storefront `sectionTitle` helper. Storefront-grade
 * 44px with a 32px mobile step-down.
 */
export const SECTION_HEADING: TypeScaleTier = {
  fontSize: "44px",
  lineHeight: "1.1",
  letterSpacing: "-0.01em",
  responsive: { mobile: { fontSize: "32px" } },
};

/**
 * Eyebrow / kicker tier — the uppercase label above a hero name or section
 * heading. The shared SIZE/weight; surfaces layer their own colour + tracking
 * (the storefront uses 0.32em gold; the talent hero uses 0.28em muted) on top.
 */
export const EYEBROW: TypeScaleTier = {
  fontSize: "12px",
  fontWeight: 700,
  textTransform: "uppercase",
};

/**
 * Lead / intro paragraph tier — the readable intro line under a hero name or a
 * section heading. Storefront-grade 18px / 1.6.
 */
export const LEAD: TypeScaleTier = {
  fontSize: "18px",
  lineHeight: "1.6",
};

/**
 * The full shared type scale, as a single object — the canonical export both
 * surfaces read. The parity test asserts the storefront and the talent default
 * both consume THIS object (referential identity of the tier fragments), which
 * is what makes the parity structural rather than a copied number.
 */
export const STOREFRONT_TYPE_SCALE = {
  display: DISPLAY,
  heroName: HERO_NAME,
  sectionHeading: SECTION_HEADING,
  eyebrow: EYEBROW,
  lead: LEAD,
} as const;

export type StorefrontTypeScaleTierKey = keyof typeof STOREFRONT_TYPE_SCALE;
