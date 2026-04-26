import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Phase B.1 — site_header section.
 *
 * The header that renders around every page when a tenant has opted into
 * the snapshot-rendered site shell (feature flag in B.2). For tenants
 * still on the hard-coded `PublicHeader`, this schema is unused at
 * runtime. The schema is intentionally conservative for v1:
 *
 *   • brand block (logo + label)
 *   • up to 8 nav links
 *   • optional primary CTA (single button)
 *   • sticky behaviour
 *   • tone (transparent vs surface)
 *
 * Auth-aware widgets (account menu, language toggle, search popover) are
 * NOT in v1's section schema. Tenants who need those keep the hard-coded
 * `PublicHeader` until a future phase introduces section-typed equivalents.
 * The feature flag is the gate that prevents auth-needing tenants from
 * losing functionality on day one.
 */

const linkSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
  external: z.boolean().optional(),
});

export const siteHeaderSchemaV1 = z.object({
  /** Brand block. */
  brand: z.object({
    label: z.string().max(60).optional(),
    logoUrl: z.string().url().max(2048).optional(),
    logoAlt: z.string().max(160).optional(),
    /** href for the brand mark (default: site root `/`). */
    href: z.string().max(500).default("/"),
  }),
  /** Primary navigation. */
  navItems: z.array(linkSchema).max(8).default([]),
  /** Optional primary CTA at the right of the header. */
  primaryCta: linkSchema.optional(),
  /** Header pinned to top of viewport on scroll. */
  sticky: z.boolean().default(true),
  /**
   * Visual tone. `transparent` overlays the page (good when the hero is
   * full-bleed); `surface` paints a token-tinted band; `solid` paints the
   * tenant's surface-raised colour explicitly.
   */
  tone: z.enum(["transparent", "surface", "solid"]).default("surface"),
  /** Layout — minimal (centered brand + nav under) vs standard (left brand, right nav). */
  variant: z.enum(["standard", "minimal", "split"]).default("standard"),
  presentation: sectionPresentationSchema,
});

export type SiteHeaderV1 = z.infer<typeof siteHeaderSchemaV1>;
export const siteHeaderSchemasByVersion = { 1: siteHeaderSchemaV1 } as const;
