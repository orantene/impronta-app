import { pickLocale } from "@/lib/i18n/pick-locale";

/**
 * Read-side helpers for canonical profile locations (residence + origin city rows).
 *
 * Legacy mirror: `talent_profiles.location_id` is kept equal to `residence_city_id` by DB trigger.
 * Read paths should prefer `residence_city_id` embeds and fall back to `location_id` only until
 * every row is backfilled and the mirror is removed (see comment on LEGACY_LOCATION_READS below).
 */

/** Minimal shape returned from `locations` embeds on public reads.
 *  `display_name_i18n` is the per-locale JSONB map (`{"en":…,"es":…}`) that
 *  replaced the dropped `display_name_en` / `display_name_es` columns. */
export type CanonicalLocationEmbed = {
  display_name_i18n: Record<string, string | null> | null;
  country_code?: string | null;
};

function normalizeEmbed(
  raw: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null | undefined,
): CanonicalLocationEmbed | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  return row ?? null;
}

/**
 * Prefer canonical residence city embed; fall back to legacy `locations` via `location_id`
 * when `residence_city_id` is still empty (pre-migration rows).
 */
export function resolveResidenceLocationEmbed(input: {
  residence_city?: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  legacy_location?: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
}): CanonicalLocationEmbed | null {
  return (
    normalizeEmbed(input.residence_city) ?? normalizeEmbed(input.legacy_location)
  );
}

export function formatCityCountryLabel(
  locale: string,
  row:
    | CanonicalLocationEmbed
    | CanonicalLocationEmbed[]
    | null
    | undefined,
): string {
  const loc = normalizeEmbed(row);
  if (!loc) return "";
  const i18n = loc.display_name_i18n ?? {};
  const city = pickLocale(locale, { en: i18n.en?.trim() ?? "", es: i18n.es?.trim() || undefined });
  const country = loc.country_code?.trim() ?? "";
  if (city && country) return `${city}, ${country}`;
  return city || country;
}

/**
 * Tracks remaining intentional reads of `location_id` / legacy `locations` embed (no FK removal yet).
 * Remove this block once the mirror column is dropped and all callers use residence only.
 */
export const LEGACY_LOCATION_MIRROR_READS = [
  "web/src/lib/directory/fetch-directory-page.ts — `.or` filters + `legacy_location:locations!location_id` embed fallback",
  "web/src/lib/home-data.ts — featured list uses legacy embed fallback; counts use effective residence ?? location_id",
  "web/src/lib/talent-dashboard-data.ts — `location_id` still selected for admin summaries",
  "web/src/app/(dashboard)/talent/my-profile/* — completion fallback `residence_city_id ?? location_id`",
  "web/src/lib/profile-completion.ts + talent-dashboard.ts — completion input accepts both ids",
  "web/src/app/t/[profileCode]/page.tsx — `legacy_location:locations!location_id` for pre-backfill rows",
  "Database RPC `api_directory_cards` — join on COALESCE(residence_city_id, location_id)",
] as const;
