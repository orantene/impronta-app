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
 * Match dev-only hostnames that should never win the canonical-origin
 * lookup. Production seed data includes 127.0.0.1 + localhost rows in
 * `agency_domains` for local Next.js dev. Without filtering them out, the
 * alphabetical sort picked `127.0.0.1` over `app.tulala.digital` and we
 * emitted `https://127.0.0.1/t/...` into prod JSON-LD + canonical tags
 * (verified 2026-05-27 on improntamodels.com — Google rich-results
 * structured-data broken).
 */
function isDevOnlyHostname(host: string): boolean {
  const lower = host.trim().toLowerCase();
  if (lower === "localhost" || lower.startsWith("localhost:")) return true;
  if (lower === "127.0.0.1" || lower.startsWith("127.0.0.1:")) return true;
  // Class-A 10.x.x.x and class-B 192.168.x.x covers most LAN dev setups.
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(lower)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(lower)) return true;
  // Common dev TLDs.
  if (lower.endsWith(".local") || lower.endsWith(".lvh.me")) return true;
  if (lower.endsWith(".localhost")) return true;
  return false;
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
      // Pull ALL `kind='app'` rows (typically 1–3) then filter dev-only
      // hostnames in app code. PostgREST doesn't have a clean "NOT IN
      // (list of patterns)" filter, so we filter client-side. Volume is
      // tiny (5 rows in prod today), so the cost is fine.
      const { data } = await supabase
        .from("agency_domains")
        .select("hostname, status")
        .eq("kind", "app")
        .in("status", ["active", "ssl_provisioned", "verified"]);
      const candidates = (data ?? [])
        .map((r) => r.hostname as string | null)
        .filter((h): h is string => Boolean(h && !isDevOnlyHostname(h)))
        .sort();
      const winner = candidates[0] ?? null;
      if (winner) {
        // Default to https in production; dev hostnames are filtered above
        // so we never emit http://localhost or https://127.0.0.1 into SEO.
        resolved = `https://${winner}`;
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
