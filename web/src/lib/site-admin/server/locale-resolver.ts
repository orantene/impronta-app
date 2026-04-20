/**
 * Phase 5 / M1 — per-tenant locale resolver.
 *
 * Reads `agency_business_identity.{default_locale, supported_locales}` and
 * caches the pair per tenant in a short-TTL in-memory map — safe to call
 * from both edge middleware and React Server Components (no `unstable_cache`,
 * which is Node-only).
 *
 * Cache TTL mirrors the existing `getLanguageSettingsForMiddleware` so
 * middleware cost stays bounded on hot paths.
 *
 * Storefront + middleware both consult this module for:
 *   - "Does the tenant support this locale?"
 *   - "What locale should we fall back to?"
 *
 * Fallback is TEMPORARY safety only — a future milestone will surface
 * missing-locale warnings via the Site Health panel; M1 simply never shows
 * the user a broken page.
 */

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  DEFAULT_PLATFORM_LOCALE,
  type Locale,
  isLocale,
} from "@/lib/site-admin/locales";

export interface TenantLocaleSettings {
  defaultLocale: Locale;
  supportedLocales: readonly Locale[];
}

const PLATFORM_FALLBACK: TenantLocaleSettings = {
  defaultLocale: DEFAULT_PLATFORM_LOCALE,
  supportedLocales: [DEFAULT_PLATFORM_LOCALE],
};

const TTL_MS = 60_000;

const cache = new Map<string, { loadedAt: number; value: TenantLocaleSettings }>();

type LocaleRow = {
  default_locale: string;
  supported_locales: string[];
};

function normalize(row: LocaleRow | null): TenantLocaleSettings {
  if (!row) return PLATFORM_FALLBACK;
  const supported = (row.supported_locales ?? []).filter(isLocale);
  const fallbackDefault: Locale = isLocale(row.default_locale)
    ? row.default_locale
    : DEFAULT_PLATFORM_LOCALE;
  if (supported.length === 0) {
    return { defaultLocale: fallbackDefault, supportedLocales: [fallbackDefault] };
  }
  return {
    defaultLocale: supported.includes(fallbackDefault)
      ? fallbackDefault
      : supported[0]!,
    supportedLocales: supported,
  };
}

/**
 * Cached (60s TTL) read of the tenant's locale settings. Returns a safe
 * platform fallback when no row exists or the DB is unreachable — callers
 * never 500 on locale lookup.
 *
 * Callers that need read-your-own-writes after an identity save should
 * invoke `invalidateTenantLocaleSettings(tenantId)`; the identity action
 * already does this via the unified cache-bust path for tenant-scoped reads.
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

  const { data, error } = await supabase
    .from("agency_business_identity")
    .select("default_locale, supported_locales")
    .eq("tenant_id", tenantId)
    .maybeSingle<LocaleRow>();

  const value = error ? PLATFORM_FALLBACK : normalize(data ?? null);
  cache.set(tenantId, { loadedAt: now, value });
  return value;
}

/** Force the next read to go to the database. Called from identity saves. */
export function invalidateTenantLocaleSettings(tenantId: string): void {
  cache.delete(tenantId);
}

/**
 * Pure helper — decides what locale to render for a requested locale, given
 * a tenant's settings.
 *
 *   - If `requested` is in `supportedLocales`  → render requested.
 *   - Otherwise                                  → render default, `isFallback=true`.
 */
export function resolveTenantLocale(
  settings: TenantLocaleSettings,
  requested: string | null | undefined,
): { locale: Locale; isFallback: boolean } {
  if (
    requested &&
    isLocale(requested) &&
    settings.supportedLocales.includes(requested)
  ) {
    return { locale: requested, isFallback: false };
  }
  return { locale: settings.defaultLocale, isFallback: true };
}
