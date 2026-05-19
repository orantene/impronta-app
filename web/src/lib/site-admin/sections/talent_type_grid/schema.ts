import { z } from "zod";

import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";
import { optionalLinkRefOrLegacy } from "../../links/link-ref";

/**
 * talent_type_grid — "Talent, by discipline" block.
 *
 * Reusable across tenants (NOT Impronta-specific). Two modes:
 *   - manual  : operator-authored cards (label/desc/image/href/term id).
 *   - dynamic : categories derived from THIS tenant's roster ∩
 *               talent_profile_taxonomy ∩ taxonomy_terms (tenant-scoped in
 *               the query layer — never RLS-only). Optional parent rollup.
 *
 * No tenant active-categories table is introduced; dynamic mode derives
 * from existing verified tables only. No taxonomy fields invented.
 */

const cardItemSchema = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  /** Optional short glyph rendered in premium card icon wells. */
  icon: z.string().max(8).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  /** CSS object-position for the card image, e.g. "50% 35%". */
  imagePosition: z.string().max(40).optional(),
  /** Optional image alt text for screen readers. */
  imageAlt: z.string().max(200).optional(),
  /** Optional taxonomy_term id → builds the directory filter link. */
  taxonomyTermId: z.string().max(64).optional(),
  /** Explicit link override (else derived from taxonomyTermId).
   *  6C — structured LinkRef; legacy string auto-coerced. */
  href: optionalLinkRefOrLegacy,
  /** Makes this card the large featured pod in rail/pod layouts. */
  featured: z.boolean().optional(),
});

export const talentTypeGridSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(320).optional(),

  mode: z.enum(["manual", "dynamic"]).default("manual"),
  /** manual mode cards. */
  items: z.array(cardItemSchema).max(18).optional(),
  /** dynamic mode: restrict to these taxonomy_term ids (empty = all roster). */
  selectedTermIds: z.array(z.string().min(1).max(64)).max(40).optional(),
  /** Roll child talent types up to their parent_category. */
  parentCategoryMode: z.boolean().optional(),

  maxItems: z.number().int().min(1).max(18).default(7),
  showCount: z.boolean().optional(),
  showCta: z.boolean().optional(),
  ctaLabel: z.string().max(40).optional(),
  seeAllLabel: z.string().max(40).optional(),
  seeAllHref: optionalLinkRefOrLegacy,

  desktopLayout: z
    .enum([
      "featured-pod-rail",
      "horizontal-rail",
      "editorial-asymmetric",
      "equal-grid",
      "compact-grid",
    ])
    .default("equal-grid"),
  mobileLayout: z
    .enum(["stacked", "horizontal-scroll", "compact-grid"])
    .default("stacked"),
  cardRatio: z.enum(["1/1", "3/4", "4/3", "16/9"]).default("3/4"),
  textPosition: z.enum(["overlay-bottom", "below"]).default("overlay-bottom"),
  showImages: z.boolean().optional(),
  showDescriptions: z.boolean().optional(),
  showCardIcons: z.boolean().optional(),
  showRailControls: z.boolean().optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  imageOverlayStrength: z
    .enum(["none", "soft", "medium", "strong"])
    .default("medium"),

  emptyStateText: z.string().max(240).optional(),

  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type TalentTypeGridV1 = z.infer<typeof talentTypeGridSchemaV1>;
export type TalentTypeGridItem = z.infer<typeof cardItemSchema>;

export const talentTypeGridSchemasByVersion = {
  1: talentTypeGridSchemaV1,
} as const;
