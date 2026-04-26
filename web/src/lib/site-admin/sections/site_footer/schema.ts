import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

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
  href: z.string().min(1).max(500),
  external: z.boolean().optional(),
});

const SOCIAL_PLATFORMS = [
  "instagram",
  "twitter",
  "linkedin",
  "facebook",
  "youtube",
  "tiktok",
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
  /** Up to 5 columns of links. */
  columns: z.array(columnSchema).max(5).default([]),
  /** Social links. Empty array hides the social row. */
  social: z.array(socialSchema).max(6).default([]),
  /** Legal block: copyright + small-print links. */
  legal: z.object({
    copyright: z.string().max(200).optional(),
    links: z.array(linkSchema).max(4).default([]),
  }),
  /** Visual variant. */
  variant: z.enum(["standard", "compact", "rich"]).default("standard"),
  /** Tone — light surface, deep canvas, or follow page tone. */
  tone: z.enum(["follow", "light", "deep"]).default("follow"),
  presentation: sectionPresentationSchema,
});

export type SiteFooterV1 = z.infer<typeof siteFooterSchemaV1>;
export const siteFooterSchemasByVersion = { 1: siteFooterSchemaV1 } as const;
