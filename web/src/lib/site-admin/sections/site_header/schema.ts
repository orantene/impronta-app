import { z } from "zod";

import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";
import { linkRefOrLegacy, optionalLinkRefOrLegacy } from "../../links/link-ref";

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
  /** 6C — structured LinkRef; legacy string auto-coerced. */
  href: linkRefOrLegacy,
  external: z.boolean().optional(),
});

/**
 * Phase 6B — reusable social/contact cluster for the premium agency
 * header. Mirrors the proven `site_footer` social pattern (platform enum
 * + href) so the two surfaces stay consistent and the auto-bound editor
 * renders it the same way. WhatsApp is included here (it isn't a footer
 * platform) because a header contact cluster commonly leads with it.
 *
 * No values are invented anywhere: an empty array simply hides the
 * cluster. Real hrefs come from the tenant's own identity data.
 */
const HEADER_SOCIAL_PLATFORMS = [
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "linkedin",
  "x",
  "whatsapp",
] as const;

const socialLinkSchema = z.object({
  platform: z.enum(HEADER_SOCIAL_PLATFORMS),
  href: z.string().min(1).max(500),
  /** Optional accessible label override (defaults to the platform name). */
  label: z.string().max(40).optional(),
});

const CONTACT_TYPES = ["phone", "email", "whatsapp"] as const;

const contactLinkSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  /** The tel:/mailto:/wa.me value. Never synthesised — owner-provided. */
  value: z.string().min(1).max(240),
  /** Optional display label (defaults to the value). */
  label: z.string().max(60).optional(),
});

export const siteHeaderSchemaV1 = z.object({
  /** Brand block. */
  brand: z.object({
    label: z.string().max(60).optional(),
    /**
     * Optional sub-wordmark line under the brand label (e.g. an agency
     * descriptor like "Agencia de Modelos & Imagen"). Renders only with
     * the text wordmark (brandDisplay `text` / `image-and-text`); ignored
     * for logo-only mode. Reusable, tenant-agnostic.
     */
    tagline: z.string().max(120).optional(),
    logoUrl: z.string().url().max(2048).optional(),
    logoAlt: z.string().max(160).optional(),
    /** href for the brand mark (default: site root `/`, applied in the
     *  Component). 6C — structured LinkRef; legacy string auto-coerced. */
    href: optionalLinkRefOrLegacy,
  }),
  /**
   * Which brand elements render. `image-and-text` (default) preserves
   * legacy behaviour (logo image + text label when both present).
   * `image` = logo asset only (use when the logo already contains the
   * wordmark — avoids a duplicate stacked wordmark). `text` = wordmark
   * only. Reusable, tenant-agnostic.
   */
  brandDisplay: z
    .enum(["image", "text", "image-and-text"])
    .default("image-and-text"),
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
  /**
   * Scroll-to-solid (Noir & Or). When set, the header starts at `tone` and
   * animates to `scrollTone` once the viewport scrolls past `scrollThresholdPx`
   * (a `[data-scrolled="true"]` attribute toggled by a tiny client observer).
   * Undefined keeps today's single static tone, so every existing tenant is
   * unchanged.
   */
  scrollTone: z.enum(["transparent", "surface", "solid"]).optional(),
  scrollThresholdPx: z.number().int().min(0).max(400).optional(),
  /**
   * Layout. `standard` = left brand / right nav. `minimal` = centered
   * brand + nav under. `split` = 3-col grid. `editorial` = premium
   * centered editorial shell (scaled wordmark, uppercase letter-spaced
   * nav on its own centered row, refined translucent sticky).
   * `editorial-split` (Phase 6B) = premium 3-zone agency header:
   * social/contact cluster left · centered brand · utilities + CTA
   * right, with the nav on its own centered row beneath. All variants
   * are reusable and theme-token-driven (accent resolves to the tenant
   * theme; neutral themes get the same structure in their own tokens).
   * Default stays `standard` so existing tenants are unchanged.
   */
  variant: z
    .enum(["standard", "minimal", "split", "editorial", "editorial-split"])
    .default("standard"),
  /**
   * Phase 6B — social links rendered in the header cluster. Empty array
   * (default) renders nothing, so every existing tenant is unchanged.
   * Reusable across tenants; values are owner-provided, never invented.
   */
  socialLinks: z.array(socialLinkSchema).max(6).default([]),
  /**
   * Phase 6B — contact links (phone / email / WhatsApp) in the header
   * cluster. Empty array (default) renders nothing. Never synthesised.
   */
  contactLinks: z.array(contactLinkSchema).max(4).default([]),
  /**
   * Phase 6B — reusable density controls. Entirely optional: when a
   * field is unset the component emits NO density data-attribute and the
   * existing CSS defaults apply verbatim (strict backward-compat — other
   * tenants are not forced into any new sizing).
   */
  density: z
    .object({
      /** Brand mark / wordmark scale. `md` == current default. */
      logoScale: z.enum(["sm", "md", "lg", "xl"]).optional(),
      /** Nav link spacing. `comfortable` == current default. */
      navDensity: z
        .enum(["compact", "comfortable", "spacious"])
        .optional(),
      /** Header vertical padding. `standard` == current default. */
      verticalPadding: z
        .enum(["tight", "standard", "roomy"])
        .optional(),
      /**
       * Small-screen nav behaviour. `wrap` == current default
       * (nav wraps / stays visible). `compact` hides nav text to a
       * tighter row; `drawer` is reserved for a future client drawer
       * (renders the same as `compact` until that ships — never breaks).
       */
      mobileMenuStyle: z
        .enum(["wrap", "compact", "drawer"])
        .optional(),
    })
    .optional(),
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
  nodePresentation: z
    .object({
      headline: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type SiteHeaderV1 = z.infer<typeof siteHeaderSchemaV1>;
export const siteHeaderSchemasByVersion = { 1: siteHeaderSchemaV1 } as const;
