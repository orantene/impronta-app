/**
 * Phase 5 / M1 — per-tenant locale resolver.  (Phase-0 multi-language upgrade)
 *
 * Reads `agency_business_identity.{default_locale, supported_locales}` and
 * caches the pair per tenant in a short-TTL in-memory map — safe to call
 * from both edge middleware and React Server Components.
 *
 * Multi-language model:
 *   - `defaultLocale`     = the PRIMARY language (also the first fallback target).
 *   - `secondaryLocales`  = the ordered remaining supported languages.
 *   - `supportedLocales`  = [default, ...secondary].
 *   - `fallbackChain(l)`  = deterministic walk for the universal content resolver
 *                           (`resolveLocalized`): [l, default, ...rest].
 *
 * N-language: supported locales are accepted as-is (validated at write time by
 * the settings action + DB CHECK against the `app_locales` registry). We no
 * longer hard-filter to en/es here.
 */

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isPostgrestMissingColumnError } from "@/lib/server/safe-error";
import { DEFAULT_PLATFORM_LOCALE, type Locale } from "@/lib/site-admin/locales";

export interface TenantLocaleSettings {
  /** Primary language = default + first fallback target. */
  defaultLocale: Locale;
  /** Ordered remaining supported languages (supported minus default). */
  secondaryLocales: readonly Locale[];
  /** [default, ...secondary]. */
  supportedLocales: readonly Locale[];
  showLanguageSwitcher: boolean;
  /** Deterministic fallback walk for `resolveLocalized(map, locale, chain)`. */
  fallbackChain: (locale: Locale) => Locale[];
}

function nonEmptyLocale(v: unknown): v is Locale {
  return typeof v === "string" && v.trim().length > 0;
}

/** Build the fallback walk for a requested locale: [requested, default, ...rest]. */
export function buildFallbackChain(
  requested: Locale,
  defaultLocale: Locale,
  supported: readonly Locale[],
): Locale[] {
  const chain: Locale[] = [requested];
  if (defaultLocale !== requested) chain.push(defaultLocale);
  for (const l of supported) if (!chain.includes(l)) chain.push(l);
  return chain;
}

/** Assemble a full settings object from a validated default + supported list. */
export function buildTenantLocaleSettings(
  defaultLocale: Locale,
  supported: readonly Locale[],
  showLanguageSwitcher: boolean,
): TenantLocaleSettings {
  const supportedList = supported.length > 0 ? supported : [defaultLocale];
  const primary = supportedList.includes(defaultLocale) ? defaultLocale : supportedList[0]!;
  const secondaryLocales = supportedList.filter((l) => l !== primary);
  return {
    defaultLocale: primary,
    secondaryLocales,
    supportedLocales: supportedList,
    // A switcher only makes sense with 2+ languages.
    showLanguageSwitcher: showLanguageSwitcher && supportedList.length > 1,
    fallbackChain: (locale: Locale) => buildFallbackChain(locale, primary, supportedList),
  };
}

const PLATFORM_FALLBACK: TenantLocaleSettings = buildTenantLocaleSettings(
  DEFAULT_PLATFORM_LOCALE,
  [DEFAULT_PLATFORM_LOCALE],
  false,
);

const TTL_MS = 60_000;

const cache = new Map<string, { loadedAt: number; value: TenantLocaleSettings }>();

type LocaleRow = {
  default_locale: string;
  supported_locales: string[];
  show_language_switcher?: boolean | null;
};

function normalize(row: LocaleRow | null): TenantLocaleSettings {
  if (!row) return PLATFORM_FALLBACK;
  const supported = (row.supported_locales ?? []).filter(nonEmptyLocale);
  const showLanguageSwitcher = row.show_language_switcher ?? true;
  const fallbackDefault: Locale = nonEmptyLocale(row.default_locale)
    ? row.default_locale
    : DEFAULT_PLATFORM_LOCALE;
  if (supported.length === 0) {
    return buildTenantLocaleSettings(fallbackDefault, [fallbackDefault], false);
  }
  return buildTenantLocaleSettings(fallbackDefault, supported, showLanguageSwitcher);
}

/**
 * Cached (60s TTL) read of the tenant's locale settings. Returns a safe
 * platform fallback when no row exists or the DB is unreachable — callers
 * never 500 on locale lookup.
 */
export async function loadTenantLocaleSettings(
  tenantId: string,
): Promise<TenantLocaleSettings> {
  if (!tenantId) return PLATFORM_FALLBACK;

  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && now - cached.loadedAt < TTL_MS) {
    return cached.value;
  }

  const supabase = createPublicSupabaseClient();
  if (!supabase) return PLATFORM_FALLBACK;

  let { data, error } = await supabase
    .from("agency_business_identity")
    .select("default_locale, supported_locales, show_language_switcher")
    .eq("tenant_id", tenantId)
    .maybeSingle<LocaleRow>();

  if (error && isPostgrestMissingColumnError(error)) {
    const fallbackRead = await supabase
      .from("agency_business_identity")
      .select("default_locale, supported_locales")
      .eq("tenant_id", tenantId)
      .maybeSingle<LocaleRow>();
    data = fallbackRead.data;
    error = fallbackRead.error;
  }

  const value = error ? PLATFORM_FALLBACK : normalize(data ?? null);
  cache.set(tenantId, { loadedAt: now, value });
  return value;
}

/** Force the next read to go to the database. Called from identity saves. */
export function invalidateTenantLocaleSettings(tenantId: string): void {
  cache.delete(tenantId);
}

/**
 * Pure helper — decides what locale to render for a requested locale, given a
 * tenant's settings.
 *   - If `requested` is in `supportedLocales` → render requested.
 *   - Otherwise                                → render default, `isFallback=true`.
 */
export function resolveTenantLocale(
  settings: TenantLocaleSettings,
  requested: string | null | undefined,
): { locale: Locale; isFallback: boolean } {
  if (requested && settings.supportedLocales.includes(requested)) {
    return { locale: requested, isFallback: false };
  }
  return { locale: settings.defaultLocale, isFallback: true };
}
