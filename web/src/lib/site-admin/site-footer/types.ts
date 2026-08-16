/**
 * types.ts — the shape `<SiteFooterInspector>` reads and writes.
 *
 * This is a FRIENDLY VIEW over the `site_footer` section's `props_jsonb`, not a
 * second store. The freeform tree remains the store of record for the footer
 * landmark's CHILDREN (`cms_pages.blocks`); the bespoke `SiteFooterComponent`'s
 * configuration — brand, columns, social, legal, variant, tone — lives in the
 * section row, which is what the renderer reads. The inspector therefore edits
 * the section row ONLY, and the landmark's freeform children are untouched by
 * construction (different table, different write).
 *
 * Kept free of Zod/`server-only` so the client inspector can import it.
 */

/** A single footer link. `href` is the flattened display/edit string form. */
export interface SiteFooterLink {
  label: string;
  href: string;
  external?: boolean;
}

/** One column of links. Schema caps the list at 5 columns × 8 links. */
export interface SiteFooterColumn {
  heading: string;
  links: SiteFooterLink[];
}

/**
 * The social platforms the `site_footer` schema accepts. Mirrors
 * `sections/site_footer/schema.ts`'s `SOCIAL_PLATFORMS` — kept as a plain
 * readonly tuple here so the client inspector can render the platform picker
 * without importing Zod.
 */
export const SITE_FOOTER_SOCIAL_PLATFORMS = [
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

export type SiteFooterSocialPlatform =
  (typeof SITE_FOOTER_SOCIAL_PLATFORMS)[number];

export interface SiteFooterSocial {
  platform: SiteFooterSocialPlatform;
  href: string;
}

export type SiteFooterBrandDisplay = "image" | "text" | "image-and-text";
export type SiteFooterVariant = "standard" | "compact" | "rich" | "editorial";
export type SiteFooterTone = "follow" | "light" | "deep";

/** The editable slice of the footer section's props. */
export interface SiteFooterSectionValue {
  brand: {
    label?: string;
    logoUrl?: string;
    logoAlt?: string;
    tagline?: string;
  };
  brandDisplay: SiteFooterBrandDisplay;
  columns: SiteFooterColumn[];
  social: SiteFooterSocial[];
  legal: {
    copyright?: string;
    links: SiteFooterLink[];
  };
  variant: SiteFooterVariant;
  tone: SiteFooterTone;
}

/** Everything the inspector needs after one load round-trip. */
export interface SiteFooterConfig {
  /** `cms_sections.id` of the tenant's site_footer row. */
  sectionId: string;
  /** CAS pointer for `saveSectionDraftAction`. */
  version: number;
  /** Locale of the shell row this footer belongs to. */
  locale: string;
  value: SiteFooterSectionValue;
  /**
   * How many freeform children the footer LANDMARK currently carries in
   * `cms_pages.blocks`. Display-only: the inspector surfaces "N custom blocks"
   * so the operator knows the landmark has freeform content the form does not
   * show, and so a reviewer can see at a glance that an inspector save left the
   * count unchanged. Null when the shell row has no footer landmark yet.
   */
  freeformChildCount: number | null;
}

/** A partial edit from one inspector control. */
export type SiteFooterPatchInput = Partial<SiteFooterSectionValue>;
