/**
 * Which field_definitions rows can appear as public directory sidebar facets.
 * Keep in sync with {@link loadDirectoryFilterSectionsUncached} in field-driven-filters.
 */
export function isDirectoryFilterEligibleField(row: {
  key: string;
  value_type: string;
  taxonomy_kind: string | null;
}, heightFilterEnabled: boolean): boolean {
  if (row.key === "height_cm") return heightFilterEnabled;
  if (row.value_type === "location") return true;
  if (row.value_type === "taxonomy_single" || row.value_type === "taxonomy_multi") {
    if (!row.taxonomy_kind) return false;
    if (row.taxonomy_kind === "location_city" || row.taxonomy_kind === "location_country")
      return false;
    return true;
  }
  return false;
}
