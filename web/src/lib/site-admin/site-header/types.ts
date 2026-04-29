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
   *  own work-in-progress, not the last published snapshot. */
  navigation: {
    items: Array<{ id: string; label: string; href: string }>;
  };
}
