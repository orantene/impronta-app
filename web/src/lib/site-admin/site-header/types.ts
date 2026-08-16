/**
 * Step 5 of the header foundation pass — the unified config the
 * <SiteHeaderInspector> reads + writes.
 *
 * Storage stays exactly as it was (Option C): identity in
 * `agency_business_identity`, branding in `agency_branding`, navigation
 * in `cms_navigation_menus`. This shape is the operator's mental
 * model — what they see in the drawer — flattened so the inspector
 * doesn't have to know which field lives where.
 */

import type { HeaderRegions } from "@/lib/site-admin/sections/site_header/regions-editing";

export type { HeaderRegions };

export interface SiteHeaderConfig {
  /** From agency_business_identity. */
  identity: {
    publicName: string;
    tagline: string | null;
    primaryCtaLabel: string | null;
    primaryCtaHref: string | null;
    /**
     * Phase 6B — social/contact, the canonical store shared with the
     * footer (`agency_business_identity`). The operator edits these in
     * the inspector's Brand tab; the header cluster + footer both read
     * them. No parallel store, no invented values (null = not provided).
     */
    contactEmail: string | null;
    contactPhone: string | null;
    whatsapp: string | null;
    socialInstagram: string | null;
    socialTiktok: string | null;
    socialFacebook: string | null;
    socialYoutube: string | null;
    socialLinkedin: string | null;
    socialX: string | null;
    version: number;
  };
  /** From agency_branding. theme tokens flatten the relevant shell.* keys. */
  branding: {
    logoMediaAssetId: string | null;
    brandMarkSvg: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    fontPreset: string | null;
    /** Live theme_json — full map; the inspector reads only shell.* keys. */
    themeJson: Record<string, string>;
    version: number;
  };
  /** Header navigation links — DRAFT-side so the operator sees their
   *  own work-in-progress, not the last published snapshot.
   *
   *  Items carry their own `version` for CAS on save. New items added
   *  client-side have `id: null` until the server returns the inserted
   *  row id on the next save. */
  navigation: {
    locale: string;
    items: Array<{
      id: string;
      label: string;
      href: string;
      visible: boolean;
      sortOrder: number;
      version: number;
    }>;
  };
  /**
   * Phase 6B — the `site_header` SECTION props the snapshot renderer
   * actually reads (variant + density). Distinct from identity/branding;
   * carries its own `version` for CAS via `saveHeaderSectionAction`.
   * Absent only if the tenant has no shell header section.
   */
  section: {
    sectionId: string;
    version: number;
    variant: string;
    /**
     * Which brand elements render: `image` (logo only) / `text`
     * (wordmark + tagline) / `image-and-text`. Editable in the builder
     * so an operator can switch to the prototype's Cinzel text wordmark.
     */
    brandDisplay: string;
    density: {
      logoScale?: string | null;
      navDensity?: string | null;
      verticalPadding?: string | null;
      mobileMenuStyle?: string | null;
    } | null;
    /**
     * WF-6 — the freeform zone layout the renderer reads when set (left /
     * center / right item lists). `null` means the tenant is still on their
     * variant's preset layout, which is what the Regions tab's empty state
     * offers to seed from.
     */
    regions: HeaderRegions | null;
  } | null;
  /**
   * WF-6 — may this workspace's plan compose the header layout? Resolved
   * server-side from `plan_tier` so the inspector's lock and the save
   * action's refusal are the same decision, not two guesses.
   */
  canEditRegions: boolean;
}

/** Item shape the inspector sends back to the bulk save action. */
export interface SiteHeaderNavItemInput {
  /** null/undefined for new items the operator just added in the drawer. */
  id?: string | null;
  label: string;
  href: string;
  visible: boolean;
  /** Required only for updates. Server returns NOT_FOUND if missing on existing rows. */
  expectedVersion?: number;
}
