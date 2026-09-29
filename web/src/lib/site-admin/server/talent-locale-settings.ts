/**
 * Talent-owned language settings (primary + secondary), 2026-09-29.
 *
 * A talent picks their OWN languages, bounded by the PLATFORM public locale
 * set (not an agency's supported set; an independent talent has no agency):
 *   - primary   = `talent_profiles.preferred_locale` (NULL = platform default)
 *   - secondary = `talent_profiles.secondary_locales` (never contains primary)
 *
 * Returned in the existing `TenantLocaleSettings` shape so every consumer that
 * already speaks it (DashboardLocaleToggle, LanguageMenu, the builder's
 * `localeSettings`) works unchanged. The switcher shows only when the talent
 * has at least one secondary language.
 */

import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { DEFAULT_PLATFORM_LOCALE, isLocale, type Locale } from "@/lib/site-admin/locales";
import { buildTenantLocaleSettings, type TenantLocaleSettings } from "./locale-resolver";

export interface TalentLocalePair {
  primary: Locale;
  secondary: readonly Locale[];
}

/**
 * Pure normalizer. Primary falls back to `platformDefault` (or the first
 * public locale) when null or not public; secondary is filtered to public
 * locales, deduped, order-preserving, and excludes the primary.
 */
export function normalizeTalentLocalePair(
  preferred: string | null | undefined,
  secondary: readonly (string | null | undefined)[] | null | undefined,
  publicLocales: readonly string[],
  platformDefault: string = DEFAULT_PLATFORM_LOCALE,
): TalentLocalePair {
  const pub = publicLocales.filter((l): l is Locale => isLocale(l));
  const fallback: Locale = pub.includes(platformDefault)
    ? platformDefault
    : (pub[0] ?? DEFAULT_PLATFORM_LOCALE);
  const primary: Locale =
    isLocale(preferred) && pub.includes(preferred) ? preferred : fallback;
  const seen = new Set<string>([primary]);
  const rest: Locale[] = [];
  for (const raw of secondary ?? []) {
    if (!isLocale(raw) || !pub.includes(raw) || seen.has(raw)) continue;
    seen.add(raw);
    rest.push(raw);
  }
  return { primary, secondary: rest };
}

/** Pure builder: talent pair -> `TenantLocaleSettings`. */
export function buildTalentLocaleSettings(
  preferred: string | null | undefined,
  secondary: readonly (string | null | undefined)[] | null | undefined,
  publicLocales: readonly string[],
  platformDefault: string = DEFAULT_PLATFORM_LOCALE,
): TenantLocaleSettings {
  const pair = normalizeTalentLocalePair(preferred, secondary, publicLocales, platformDefault);
  return buildTenantLocaleSettings(
    pair.primary,
    [pair.primary, ...pair.secondary],
    pair.secondary.length > 0,
  );
}

const TTL_MS = 60_000;
const cache = new Map<string, { loadedAt: number; value: TenantLocaleSettings }>();

/** Drop the cached settings for one talent (call after a write). */
export function invalidateTalentLocaleSettings(profileId: string): void {
  cache.delete(profileId);
}

type Row = { preferred_locale: string | null; secondary_locales?: string[] | null };

/**
 * Raw read of the talent's stored pair. Tolerates a missing
 * `secondary_locales` column (pre-migration) by retrying without it.
 */
export async function loadTalentLocaleRow(profileId: string): Promise<Row | null> {
  const supabase = createPublicSupabaseClient();
  if (!supabase || !profileId) return null;
  const first = await supabase
    .from("talent_profiles")
    .select("preferred_locale, secondary_locales")
    .eq("id", profileId)
    .maybeSingle<Row>();
  if (!first.error) return first.data ?? null;
  if (!isPostgrestMissingColumnError(first.error)) {
    logServerError("talent-locale-settings.load", first.error);
    return null;
  }
  const retry = await supabase
    .from("talent_profiles")
    .select("preferred_locale")
    .eq("id", profileId)
    .maybeSingle<Row>();
  if (retry.error) {
    if (!isPostgrestMissingColumnError(retry.error)) {
      logServerError("talent-locale-settings.loadRetry", retry.error);
    }
    return null;
  }
  return retry.data ?? null;
}

/**
 * Cached (60 s) talent locale settings. Never throws: degrades to the
 * single-locale platform default.
 */
export async function loadTalentLocaleSettings(profileId: string): Promise<TenantLocaleSettings> {
  const now = Date.now();
  const hit = profileId ? cache.get(profileId) : undefined;
  if (hit && now - hit.loadedAt < TTL_MS) return hit.value;

  const [language, row] = await Promise.all([
    getLanguageSettingsPublicCached().catch(() => null),
    profileId ? loadTalentLocaleRow(profileId).catch(() => null) : Promise.resolve(null),
  ]);
  const publicLocales = language?.publicLocales?.length
    ? language.publicLocales
    : [DEFAULT_PLATFORM_LOCALE];
  const value = buildTalentLocaleSettings(
    row?.preferred_locale ?? null,
    row?.secondary_locales ?? [],
    publicLocales,
    language?.defaultLocale ?? DEFAULT_PLATFORM_LOCALE,
  );
  if (profileId && row) cache.set(profileId, { loadedAt: now, value });
  return value;
}

/** Convenience: the `{primary, secondary}` view of the settings. */
export function talentLocalePairFromSettings(s: TenantLocaleSettings): TalentLocalePair {
  return { primary: s.defaultLocale, secondary: s.secondaryLocales };
}
