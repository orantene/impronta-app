import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";
import { nodePresentationSchema } from "../shared/node-presentation";

/**
 * directory — a portable, multi-instance talent directory section.
 *
 * Drop it on ANY builder page, as many times as the tenant wants. Each
 * instance is independently scoped (e.g. `scope=by_talent_type` →
 * chefs only for an "Our Chefs" page), labeled (`headline`), and styled
 * (`template` × `cardStyle` × controls). There is no privileged
 * `/directory` route — this section IS the directory, everywhere.
 *
 * Render reuses the existing connected engine (DirectoryDiscoverSection +
 * the tenant-scoped card/sidebar/filter catalogs + HeroSearch). This
 * schema carries only per-instance configuration.
 *
 * v1: `template` is locked to "atelier" + `cardStyle` to
 * "portrait"/"editorial" at render time (canonical-first); the other enum
 * values exist so future variations need NO schema migration.
 */

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  behavior: z.enum(["profile", "inquiry", "external"]).default("profile"),
  externalHref: z.string().max(500).optional(),
});

export const directorySchemaV1 = z.object({
  // — Heading (the per-instance label: "People" / "Models" / "Our Chefs") —
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(400).optional(),
  headerAlign: z.enum(["center", "left", "split"]).default("center"),
  showHeading: z.boolean().default(true),

  // — Source & Audience (per-instance scoping is the whole point) —
  entityLabel: z
    .enum(["talent", "people", "members", "professionals", "providers", "team"])
    .default("talent"),
  scope: z.enum(["all", "by_talent_type", "by_tag", "manual"]).default("all"),
  talentTypeKeys: z.array(z.string().min(1).max(80)).max(40).default([]),
  tagKeys: z.array(z.string().min(1).max(80)).max(40).default([]),
  manualProfileCodes: z.array(z.string().min(1).max(40)).max(200).default([]),
  /** Feature-first: pinned to the front, in order. */
  pinnedProfileCodes: z.array(z.string().min(1).max(40)).max(50).default([]),
  /** Hide specific talent from this instance. */
  excludedProfileCodes: z.array(z.string().min(1).max(40)).max(200).default([]),
  /**
   * VS-1: default OFF — the section must not exclude `is_discoverable`
   * talent the Discover pipeline didn't. No-photo talent still render via
   * the card's graceful name fallback. Opt-in only when an operator
   * explicitly wants a photo-only gallery.
   */
  requirePhoto: z.boolean().default(false),
  excludeUnavailable: z.boolean().default(false),
  minTrustTier: z
    .enum(["any", "basic", "verified", "silver", "gold"])
    .default("any"),
  defaultSort: z
    .enum(["recommended", "newest", "az", "availability", "curated"])
    .default("recommended"),
  pagination: z.enum(["load_more", "infinite", "paged"]).default("infinite"),
  pageSize: z.number().int().min(6).max(60).default(24),

  // — Template (macro layout) —
  template: z
    .enum([
      "atelier",
      "studio",
      "roster",
      "practice",
      "field",
      "showcase",
      "mosaic",
      "map_first",
    ])
    .default("atelier"),
  columnsDesktop: z.number().int().min(1).max(6).default(4),
  columnsTablet: z.number().int().min(1).max(4).default(3),
  columnsMobile: z.number().int().min(1).max(2).default(2),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  containerWidth: z.enum(["boxed", "full"]).default("boxed"),
  background: z.enum(["cool_ground", "plain", "subtle"]).default("cool_ground"),

  // — Card (micro-unit) —
  cardStyle: z
    .enum([
      "portrait",
      "editorial",
      "portfolio",
      "profile",
      "stat",
      "service",
      "minimal",
    ])
    .default("portrait"),
  cardAspect: z.enum(["4:5", "1:1", "3:4", "16:9"]).default("4:5"),
  showName: z.boolean().default(true),
  /** Used when showName=false (privacy verticals). */
  nameFallback: z
    .enum(["code", "role", "first_name", "hidden"])
    .default("first_name"),
  showTalentType: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showAttributes: z.boolean().default(true),
  /**
   * @deprecated NO-OP — nothing in the render path reads this. Rating only
   * appears inside the standing chip, which is governed tenant-wide by the
   * `directory.card.show-standing` token (Card Design → Reviews on cards).
   * Kept so existing published snapshots still parse; do not wire new UI to it.
   */
  showRating: z.boolean().default(false),
  showPriceFrom: z.boolean().default(true),
  showAvailability: z.boolean().default(true),
  showBadges: z.boolean().default(true),
  showSave: z.boolean().default(true),
  showAddToInquiry: z.boolean().default(true),
  /** Card eye affordance — media quick-view lightbox, no navigation. */
  showQuickView: z.boolean().default(true),
  /**
   * What a card click does. "modal" (default) = quick-open the profile in the
   * intercepting-route overlay (URL still becomes /t/<code>, full tracking
   * parity); "page" = hard navigation to the canonical profile page.
   */
  cardClickAction: z.enum(["modal", "page"]).default("modal"),
  hoverBehavior: z
    .enum(["zoom", "swap", "reveal_traits", "none"])
    .default("reveal_traits"),
  /** Overrides the card display catalog order; empty = catalog default. */
  cardFieldKeys: z.array(z.string().min(1).max(80)).max(24).default([]),
  maxFieldLines: z.number().int().min(1).max(6).default(3),
  cta: ctaSchema.optional(),

  // — Filters & Sidebar —
  sidebarShow: z.boolean().default(false),
  sidebarPosition: z.enum(["left", "right"]).default("left"),
  sidebarSticky: z.boolean().default(true),
  sidebarDefaultCollapsed: z.boolean().default(true),
  filterSearchBox: z.boolean().default(true),
  topBarMode: z.enum(["none", "talent_type", "field"]).default("talent_type"),
  topBarFieldKey: z.string().max(80).optional(),
  sortControlShow: z.boolean().default(true),
  showResultCount: z.boolean().default(true),
  showActiveChips: z.boolean().default(true),
  mobileFilterStyle: z
    .enum(["sheet", "drawer", "inline"])
    .default("sheet"),

  // — AI Search —
  aiMode: z
    .enum(["off", "inline_strip", "hero_band", "floating"])
    .default("hero_band"),
  aiPlacement: z
    .enum(["above_center", "above_left", "in_sidebar", "replace_heading"])
    .default("above_center"),
  aiTitle: z.string().max(120).optional(),
  aiBody: z.string().max(400).optional(),
  aiPlaceholder: z.string().max(160).optional(),
  aiExamplePrompts: z.array(z.string().min(1).max(160)).max(8).default([]),
  aiBehavior: z.enum(["interpret", "rerank"]).default("interpret"),

  /**
   * Full-bleed lifestyle banner behind the heading + AI search band. A public
   * image path/URL (e.g. `/talent-templates/demo/impronta-2026/lifestyle-3.jpg`
   * or an https media URL). When set, the section header, the search band and
   * the category quick-link bar render INSIDE an edge-to-edge photo banner
   * with a noir gradient; empty/unset keeps the plain editorial header.
   */
  heroImage: z.string().max(500).optional(),

  /**
   * Per-instance card kit override (P4). A card-kit slug (e.g.
   * "editorial-noir" / "magazine" / "minimal-portrait", see
   * `lib/site-admin/presets/card-kits.ts`). PLAIN data only — this is the
   * operator's intent for THIS directory instance, decoupled from the
   * tenant-wide published Card Design.
   *
   * APPLICATION (render-side contract): the kit is resolved via
   * `getCardKit(slug)` and its `card.*` tokens are projected to inline
   * `--token-card-*` CSS vars set on THIS section's wrapper element (the
   * cards below inherit them through the `var(--token-card-*, …)` fallback
   * chain in `TALENT_CARD_VARS`). It MUST be applied as inline `style` vars,
   * NEVER a linked style class: `publishPageSnapshot` does not bake classes,
   * so a class-based kit would silently drop on publish. Empty / unset → the
   * instance inherits the tenant's published card palette.
   */
  cardKitOverride: z.string().max(64).optional(),

  // — Empty / SEO —
  emptyStateTitle: z.string().max(120).optional(),
  emptyStateText: z.string().max(240).optional(),
  emptyStateCtaLabel: z.string().max(60).optional(),
  emptyStateCtaHref: z.string().max(500).optional(),
  structuredData: z.boolean().default(true),

  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type DirectoryV1 = z.infer<typeof directorySchemaV1>;
export type DirectoryCta = z.infer<typeof ctaSchema>;

export const directorySchemasByVersion = {
  1: directorySchemaV1,
  // v2: same shape as v1 — the bump exists only to run the showPriceFrom
  // backfill migration exactly once per persisted section.
  2: directorySchemaV1,
} as const;
