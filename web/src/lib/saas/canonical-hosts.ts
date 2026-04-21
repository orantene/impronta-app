/**
 * Phase 5/6 M2 — canonical public-surface origin resolver.
 *
 * The canonical talent page (`/t/[profileCode]`) lives on the app host no
 * matter which host served the request. The agency overlay view on an
 * agency host must emit `<link rel="canonical">` pointing at the app-host
 * URL so search engines consolidate signals on the global view.
 *
 * Source of truth is `public.agency_domains` (`kind='app'` row). No
 * hostnames are hardcoded — an operator can rotate the app host in the DB
 * and this helper picks it up within `CACHE_TTL_MS`.
 */
import { createPublicSupabaseClient } from "@/lib/supabase/public";

type CacheEntry = { origin: string | null; expiresAt: number };
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 1000;

function envOrigin(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the canonical app-host origin (e.g. `https://app.pdcvacations.com`).
 *
 * Lookup order:
 *   1. `agency_domains` row where `kind='app'` AND status IN active set —
 *      the DB-driven answer, always correct in production.
 *   2. `NEXT_PUBLIC_APP_URL` env var — useful in local dev when the DB is
 *      not reachable or has no app-host row.
 *   3. `NEXT_PUBLIC_SITE_URL` env var — last-resort fallback; many repos
 *      already set this and it's better than emitting a bare path.
 *
 * Returns `null` only when every source is empty; callers should degrade
 * gracefully (e.g. omit the canonical tag rather than emit a broken URL).
 */
export async function getCanonicalAppHostOrigin(): Promise<string | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.origin;

  let resolved: string | null = null;

  try {
    const supabase = createPublicSupabaseClient();
    if (supabase) {
      const { data } = await supabase
        .from("agency_domains")
        .select("hostname, status")
        .eq("kind", "app")
        .in("status", ["active", "ssl_provisioned", "verified"])
        .order("hostname", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.hostname) {
        // Default to https in production; local dev hostnames are handled by
        // the env-var fallback so we don't emit http://localhost into SEO.
        resolved = `https://${data.hostname}`;
      }
    }
  } catch {
    // Fall through to env-var fallback.
  }

  if (!resolved) {
    resolved = envOrigin();
  }

  cache = { origin: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
  return resolved;
}

/**
 * Build the canonical `/t/[profileCode]` URL — absolute, app-host, no
 * locale prefix. Used by metadata on every host kind that renders the
 * talent page.
 */
export async function canonicalTalentUrl(
  profileCode: string,
): Promise<string | null> {
  const origin = await getCanonicalAppHostOrigin();
  if (!origin) return null;
  return `${origin}/t/${encodeURIComponent(profileCode)}`;
}
