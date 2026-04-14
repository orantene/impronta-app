/**
 * Which field_definitions rows can be rendered as public directory sidebar facets.
 * Admin Directory filters lists all fields with `directory_filter_visible` (or legacy `filterable`);
 * this helper documents which types have full public UI + query support today.
 *
 * Keep in sync with {@link loadDirectoryFilterSectionsUncached} in field-driven-filters.
 */
export function isDirectoryFilterEligibleField(
  row: {
    key: string;
    value_type: string;
    taxonomy_kind: string | null;
    config?: Record<string, unknown> | null;
  },
  heightFilterEnabled: boolean,
): boolean {
  if (row.key === "height_cm") return heightFilterEnabled;
  if (row.value_type === "location") return true;
  if (row.value_type === "taxonomy_single" || row.value_type === "taxonomy_multi") {
    if (!row.taxonomy_kind) return false;
    if (row.taxonomy_kind === "location_city" || row.taxonomy_kind === "location_country") return false;
    return true;
  }
  if (row.value_type === "boolean") return true;
  const opts = row.config?.filter_options;
  if (
    (row.value_type === "text" || row.value_type === "textarea") &&
    Array.isArray(opts) &&
    opts.length > 0
  ) {
    return true;
  }
  // Canonical gender lives on talent_profiles; facet wiring uses profile column + URL `ff` (see fetch-directory-page).
  if (row.key === "gender" && row.value_type === "text") return true;
  return false;
}
