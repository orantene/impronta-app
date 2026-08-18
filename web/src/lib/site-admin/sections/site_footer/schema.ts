import { z } from "zod";

import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";
import { linkRefOrLegacy } from "../../links/link-ref";

/**
 * Phase B.1 — site_footer section.
 *
 * Mirrors the conservative scoping of site_header. v1 supports:
 *
 *   • brand recap + tagline
 *   • up to 5 link columns × up to 8 links each
 *   • up to 6 social links
 *   • legal copy (copyright + 1-3 legal links)
 *
 * No newsletter signup form, no language switcher, no sitemap-style auto
 * generation. Those land in later phases as additional section types or
 * extensions.
 */

const linkSchema = z.object({
  label: z.string().min(1).max(60),
  /** 6C — structured LinkRef; legacy string auto-coerced. */
  href: linkRefOrLegacy,
  external: z.boolean().optional(),
});

/**
 * The footer's platform list. `x` and `whatsapp` were absent here while the
 * freeform `social_links` node had them, so the same tenant could show a
 * WhatsApp mark in one surface and be unable to add it in the other. Additive
 * only — `twitter` stays for stored rows and resolves to the same glyph as `x`.
 */
const SOCIAL_PLATFORMS = [
  "instagram",
  "twitter",
  "x",
  "linkedin",
  "facebook",
  "youtube",
  "tiktok",
  "whatsapp",
  "pinterest",
  "vimeo",
  "spotify",
  "github",
  "email",
] as const;

const socialSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  href: z.string().min(1).max(500),
});

const columnSchema = z.object({
  heading: z.string().min(1).max(60),
  links: z.array(linkSchema).max(8).default([]),
});

export const siteFooterSchemaV1 = z.object({
  brand: z.object({
    label: z.string().max(60).optional(),
    logoUrl: z.string().url().max(2048).optional(),
    logoAlt: z.string().max(160).optional(),
    tagline: z.string().max(240).optional(),
  }),
  /**
   * Which brand elements render — mirrors `site_header.brandDisplay`.
   * `image-and-text` (default) preserves legacy behaviour. `image` =
   * logo asset only (use when the logo already bakes the wordmark —
   * avoids a duplicate stacked wordmark, e.g. Impronta's footer).
   * `text` = wordmark + tagline only. Reusable, tenant-agnostic.
   */
  brandDisplay: z
    .enum(["image", "text", "image-and-text"])
    .default("image-and-text"),
  /** Up to 5 columns of links. */
  columns: z.array(columnSchema).max(5).default([]),
  /** Social links. Empty array hides the social row. */
  social: z.array(socialSchema).max(6).default([]),
  /** Legal block: copyright + small-print links. */
  legal: z.object({
    copyright: z.string().max(200).optional(),
    links: z.array(linkSchema).max(4).default([]),
  }),
  /** Visual variant. `editorial` (Phase 6B) = premium agency footer
   * matched to the v11 prototype: gold-gradient serif wordmark, wide
   * brand block + link columns (1.6fr/1fr/1fr/1fr), serif column
   * headings, refined legal row. Token-driven (accent → ink fallback);
   * default stays `standard` so existing tenants are unchanged. */
  variant: z
    .enum(["standard", "compact", "rich", "editorial"])
    .default("standard"),
  /** Tone — light surface, deep canvas, or follow page tone. */
  tone: z.enum(["follow", "light", "deep"]).default("follow"),
  nodePresentation: z
    .object({
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type SiteFooterV1 = z.infer<typeof siteFooterSchemaV1>;
export const siteFooterSchemasByVersion = { 1: siteFooterSchemaV1 } as const;
