/**
 * Single source of truth: identity + canonical location live on `talent_profiles`
 * (display_name, short_bio, first_name, last_name, phone, gender, date_of_birth,
 * residence / origin country+city, etc.). Dynamic `field_values` must not duplicate those attributes.
 *
 * `height_cm` is intentionally mirrored: edited via field_definitions (traits) and
 * copied to `talent_profiles.height_cm` for directory/API performance (see field save actions).
 */

/**
 * Ordered keys for canonical Basic Information — used in Admin → Fields (basic_info group)
 * and to keep system field_definitions that mirror columns in a stable order.
 * Do not create new dynamic fields with these keys.
 */
export const CANONICAL_BASIC_INFORMATION_DEFINITION_ORDER = [
  "display_name",
  "first_name",
  "last_name",
  "phone",
  "gender",
  "date_of_birth",
  "residence_country_id",
  "residence_city_id",
  "origin_country_id",
  "origin_city_id",
  "short_bio",
  /** Legacy mirror for residence; do not recreate as dynamic geography. */
  "location",
] as const;

/** Ordered list for admin copy, audits, and docs — keep in sync with migrations that archive these keys. */
export const RESERVED_TALENT_PROFILE_FIELD_KEYS_ARRAY = [
  ...CANONICAL_BASIC_INFORMATION_DEFINITION_ORDER,
] as const;

export const RESERVED_TALENT_PROFILE_FIELD_KEYS = new Set<string>(
  RESERVED_TALENT_PROFILE_FIELD_KEYS_ARRAY,
);

const CANONICAL_ORDER_INDEX = new Map<string, number>(
  CANONICAL_BASIC_INFORMATION_DEFINITION_ORDER.map((k, i) => [k, i]),
);

/** Shown in admin Fields UI — canonical columns are edited on profile forms only. */
export function reservedTalentProfileFieldKeysHint(): string {
  return RESERVED_TALENT_PROFILE_FIELD_KEYS_ARRAY.join(", ");
}

/**
 * Dynamic `location` value_type rows duplicated canonical geography and governance.
 * New location-type definitions are blocked in admin actions; canonical geography stays on the profile row.
 */
export function isBlockedDynamicLocationValueType(valueType: string): boolean {
  return valueType === "location";
}

export function isReservedTalentProfileFieldKey(key: string): boolean {
  return RESERVED_TALENT_PROFILE_FIELD_KEYS.has(key);
}

export function filterOutReservedFieldDefinitions<T extends { key: string }>(rows: T[]): T[] {
  return rows.filter((d) => !isReservedTalentProfileFieldKey(d.key));
}

/** Sort field definition rows that mirror canonical Basic Information columns (Admin → Fields). */
export function sortCanonicalBasicInformationDefinitions<T extends { key: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ia = CANONICAL_ORDER_INDEX.get(a.key) ?? 999;
    const ib = CANONICAL_ORDER_INDEX.get(b.key) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.key.localeCompare(b.key);
  });
}

/**
 * For the Basic Information group only: fixed-order canonical rows vs reorderable enrichment fields.
 */
export function partitionBasicInformationGroupFields<T extends { key: string; sort_order: number }>(
  fields: T[],
): { canonical: T[]; extras: T[] } {
  const canonical: T[] = [];
  const extras: T[] = [];
  for (const f of fields) {
    if (isReservedTalentProfileFieldKey(f.key)) canonical.push(f);
    else extras.push(f);
  }
  return {
    canonical: sortCanonicalBasicInformationDefinitions(canonical),
    extras: [...extras].sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key)),
  };
}
