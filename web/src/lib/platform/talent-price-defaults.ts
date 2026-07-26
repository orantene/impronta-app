import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Platform-wide fallback "From $X" for talent cards — the last link in the
 * pricing cascade (see lib/directory/pricing-defaults-shape.ts).
 *
 * `platform_settings` is a singleton with no `tenant_id`, so it cannot use
 * tenantScopedQuery; the raw read lives here in `lib` rather than in an action
 * file, matching lib/platform/commercial-defaults.ts.
 *
 * NULL by default on purpose. The platform cannot know what any given agency
 * charges, so nothing is shown until a super_admin sets a number deliberately.
 * Cached in-module briefly because the directory reads it on every page load
 * and it changes about never.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

export type PlatformTalentPriceDefault = {
  fromCents: number | null;
  currency: string;
};

let cache: { at: number; value: PlatformTalentPriceDefault } | null = null;

export async function loadPlatformTalentPriceDefault(): Promise<PlatformTalentPriceDefault> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const fallback: PlatformTalentPriceDefault = {
    fromCents: null,
    currency: "USD",
  };
  const admin = createServiceRoleClient();
  if (!admin) return fallback;

  const { data, error } = await admin
    .from("platform_settings")
    .select("default_talent_price_from_cents, operating_currency")
    .limit(1)
    .maybeSingle();

  if (error || !data) return fallback;

  const raw = (data as {
    default_talent_price_from_cents: number | null;
    operating_currency: string | null;
  });
  const value: PlatformTalentPriceDefault = {
    fromCents:
      typeof raw.default_talent_price_from_cents === "number" &&
      raw.default_talent_price_from_cents > 0
        ? raw.default_talent_price_from_cents
        : null,
    currency: (raw.operating_currency ?? "USD").toUpperCase(),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Drop the cache so an admin save is reflected without waiting out the TTL. */
export function invalidatePlatformTalentPriceDefault(): void {
  cache = null;
}
