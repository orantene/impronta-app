import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Phase B — site_header section.
 *
 * The header that renders around every page when a tenant has opted into
 * the snapshot-rendered site shell. For tenants still on the hard-coded
 * `PublicHeader`, this schema is unused at runtime.
 *
 * v1 supports operator-edited:
 *   • brand block (logo + label)
 *   • up to 8 nav links
 *   • optional primary CTA (single button)
 *   • sticky behaviour
 *   • tone (transparent vs surface)
 *
 * Phase B.2 adds an `authArea` block of toggles that decide whether the
 * existing PUBLIC auth-aware widgets (account menu, language toggle,
 * discovery search) render alongside the operator-edited content. These
 * widgets stay rendered by their existing components — the schema only
 * controls visibility, not their internals. This lets tenants like
 * impronta opt into the snapshot shell without losing account or
 * discovery chrome (guardrail 5 of B.2).
 *
 * The default for every flag is `true` so a backfill that doesn't set
 * them explicitly preserves the legacy header functionality verbatim.
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
  /**
   * Auth-area toggles. Each flag controls whether the matching widget
   * renders inside the snapshot-shell header. Widgets are rendered by
   * their existing PublicHeader-side components; the schema only decides
   * visibility. Default true preserves legacy behaviour for any tenant
   * promoted onto the shell without explicit flag config.
   */
  authArea: z
    .object({
      /** Render the AccountMenu (logged-in / sign-in affordance). */
      showAccountMenu: z.boolean().default(true),
      /** Render the locale toggle when more than one locale is active. */
      showLanguageToggle: z.boolean().default(true),
      /** Render the discovery-tools popover (search + saved talent). */
      showDiscoveryTools: z.boolean().default(true),
    })
    .default({
      showAccountMenu: true,
      showLanguageToggle: true,
      showDiscoveryTools: true,
    }),
  presentation: sectionPresentationSchema,
});

export type SiteHeaderV1 = z.infer<typeof siteHeaderSchemaV1>;
export const siteHeaderSchemasByVersion = { 1: siteHeaderSchemaV1 } as const;
