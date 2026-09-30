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
import { createServiceRoleClient } from "@/lib/supabase/admin";
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

/**
 * The primary the dashboard cookie may be SEEDED to, or null when it is not
 * known for certain. Only a stored `preferred_locale` that a SUCCESSFUL
 * platform-language read lists as public qualifies. A degraded read (row not
 * readable, language settings unavailable, preference unset) must never seed:
 * 2026-09-29 QA saw the dashboard flip-flop ES/EN because a failed read fell
 * back to the platform default and the seed wrote that over the auto cookie,
 * then the next good read wrote the real primary back.
 */
export function talentSeedPrimary(input: {
  rowRead: boolean;
  preferred: string | null | undefined;
  publicLocales: readonly string[] | null;
}): Locale | null {
  if (!input.rowRead || !input.publicLocales) return null;
  return isLocale(input.preferred) && input.publicLocales.includes(input.preferred)
    ? input.preferred
    : null;
}

export interface TalentLocaleState {
  settings: TenantLocaleSettings;
  /** See `talentSeedPrimary`. */
  seedPrimary: Locale | null;
}

const TTL_MS = 60_000;
const cache = new Map<string, { loadedAt: number; value: TalentLocaleState }>();

/** Drop the cached settings for one talent (call after a write). */
export function invalidateTalentLocaleSettings(profileId: string): void {
  cache.delete(profileId);
}

type Row = { preferred_locale: string | null; secondary_locales?: string[] | null };

/**
 * Raw read of the talent's stored pair. Service-role, scoped to one id:
 * callers pass the SESSION talent's own profile id. (The anon client is
 * subject to talent_profiles RLS and can hide an unpublished profile, which
 * read as "no preference".) Tolerates a missing `secondary_locales` column.
 * Returns `{ ok: false }` on any failure so callers can tell "unset" from
 * "unknown".
 */
export async function readTalentLocaleRow(
  profileId: string,
): Promise<{ ok: true; row: Row | null } | { ok: false }> {
  const supabase = createServiceRoleClient();
  if (!supabase || !profileId) return { ok: false };
  const first = await supabase
    .from("talent_profiles")
    .select("preferred_locale, secondary_locales")
    .eq("id", profileId)
    .maybeSingle<Row>();
  if (!first.error) return { ok: true, row: first.data ?? null };
  if (!isPostgrestMissingColumnError(first.error)) {
    logServerError("talent-locale-settings.load", first.error);
    return { ok: false };
  }
  const retry = await supabase
    .from("talent_profiles")
    .select("preferred_locale")
    .eq("id", profileId)
    .maybeSingle<Row>();
  if (retry.error) {
    logServerError("talent-locale-settings.loadRetry", retry.error);
    return { ok: false };
  }
  return { ok: true, row: retry.data ?? null };
}

/** Back-compat: the row, or null when unset OR unreadable. */
export async function loadTalentLocaleRow(profileId: string): Promise<Row | null> {
  const r = await readTalentLocaleRow(profileId);
  return r.ok ? r.row : null;
}

/**
 * Cached (60 s) talent locale state. Never throws. Only fully successful
 * reads are cached, so a transient failure is not pinned for a minute.
 */
export async function loadTalentLocaleState(profileId: string): Promise<TalentLocaleState> {
  const now = Date.now();
  const hit = profileId ? cache.get(profileId) : undefined;
  if (hit && now - hit.loadedAt < TTL_MS) return hit.value;

  const [language, read] = await Promise.all([
    getLanguageSettingsPublicCached().catch(() => null),
    profileId
      ? readTalentLocaleRow(profileId).catch(() => ({ ok: false }) as const)
      : Promise.resolve({ ok: false } as const),
  ]);
  const languageOk = Boolean(language?.publicLocales?.length);
  const publicLocales = languageOk ? language!.publicLocales : [DEFAULT_PLATFORM_LOCALE];
  const row = read.ok ? read.row : null;
  const value: TalentLocaleState = {
    settings: buildTalentLocaleSettings(
      row?.preferred_locale ?? null,
      row?.secondary_locales ?? [],
      publicLocales,
      language?.defaultLocale ?? DEFAULT_PLATFORM_LOCALE,
    ),
    seedPrimary: talentSeedPrimary({
      rowRead: read.ok,
      preferred: row?.preferred_locale,
      publicLocales: languageOk ? publicLocales : null,
    }),
  };
  if (profileId && read.ok && languageOk) cache.set(profileId, { loadedAt: now, value });
  return value;
}

/** Cached (60 s) talent locale settings (see `loadTalentLocaleState`). */
export async function loadTalentLocaleSettings(profileId: string): Promise<TenantLocaleSettings> {
  return (await loadTalentLocaleState(profileId)).settings;
}

/** Convenience: the `{primary, secondary}` view of the settings. */
export function talentLocalePairFromSettings(s: TenantLocaleSettings): TalentLocalePair {
  return { primary: s.defaultLocale, secondary: s.secondaryLocales };
}
