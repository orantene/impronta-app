import type { TalentOffering } from "@/lib/talent/offerings-types";

/**
 * TUL-446 — omit editor fields from the public offering object so they never
 * enter the RSC flight payload (catalog / portfolio / task-picker islands).
 * Locale is already baked into title/description/categoryLabel.
 *
 * `status`, `visibility`, `moderationState` and `sortOrder` STAY: the catalog
 * (`isPublicEligibleOffering`, `filterOfferingsForCatalog`) and the live-site
 * prune (`pruneEmptyBoundSections`) re-check them, so stripping them made every
 * offering look ineligible and removed the services band, its anchor and the
 * booking bar from every talent site.
 */
export function stripPublicOfferingFlightFields(offering: TalentOffering): TalentOffering {
  const {
    titleI18n: _titleI18n,
    descriptionI18n: _descriptionI18n,
    firstPublishedAt: _firstPublishedAt,
    updatedAt: _updatedAt,
    ...rest
  } = offering;
  return rest as TalentOffering;
}
