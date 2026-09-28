/**
 * Which flag opens the `kind=talent-theme` preview for a given Design slug
 * (AUD-033).
 *
 * The Maison "Choose a design" card is shown by `TALENT_MAISON_THEME_ENABLED`
 * (per talent), but this route used to require the separate
 * `TALENT_THEME_GALLERY_ENABLED` switch, which is off in production. So the
 * card embedded `/template-preview/maison?kind=talent-theme` and got the app's
 * "Page not found" page. The rule now follows the card:
 *   - a Maison slug (`maison`, `maison-*`) opens when the Maison flag is on
 *     for the talent (the same check that decides whether the card renders);
 *   - any other slug still needs the generic gallery flag.
 */
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { isMaisonCatalogSlug } from "@/lib/talent-site/theme-catalog/maison/catalog-visibility";

export function isThemePreviewAllowed(
  designSlug: string,
  talentProfileId: string | null | undefined,
  deps: {
    galleryEnabled?: () => boolean;
    maisonEnabled?: (talentProfileId?: string | null) => boolean;
  } = {},
): boolean {
  const galleryEnabled = deps.galleryEnabled ?? isTalentThemeGalleryEnabled;
  const maisonEnabled = deps.maisonEnabled ?? ((id) => isTalentMaisonThemeEnabled(id));
  if (isMaisonCatalogSlug(designSlug)) return maisonEnabled(talentProfileId);
  return galleryEnabled();
}
