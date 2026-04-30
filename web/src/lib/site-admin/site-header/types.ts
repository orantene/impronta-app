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

export interface SiteHeaderConfig {
  /** From agency_business_identity. */
  identity: {
    publicName: string;
    tagline: string | null;
    primaryCtaLabel: string | null;
    primaryCtaHref: string | null;
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
