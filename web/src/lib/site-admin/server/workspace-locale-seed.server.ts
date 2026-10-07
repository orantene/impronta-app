import "server-only";

/**
 * Reads the language a workspace admin cookie may be seeded to (TUL-117).
 * Pure rules live in `workspace-locale-seed.ts`; this is only the I/O.
 *
 * A DEGRADED read (identity row unreadable or missing, platform language
 * settings unavailable) returns null and seeds nothing: falling back to the
 * platform default here would write English over a correct cookie, the same
 * ES/EN flip-flop `talentSeedPrimary` documents.
 */

import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { logServerError } from "@/lib/server/safe-error";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Locale } from "@/lib/site-admin/locales";

import { workspaceSeedPrimary } from "./workspace-locale-seed";

const TTL_MS = 60_000;
const cache = new Map<string, { loadedAt: number; value: Locale | null }>();

export async function loadWorkspaceSeedPrimary(tenantId: string): Promise<Locale | null> {
  if (!tenantId) return null;
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && now - hit.loadedAt < TTL_MS) return hit.value;

  const supabase = createPublicSupabaseClient();
  if (!supabase) return null;
  const [language, read] = await Promise.all([
    getLanguageSettingsPublicCached().catch(() => null),
    supabase
      .from("agency_business_identity")
      .select("default_locale")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ default_locale: string | null }>(),
  ]);
  if (read.error) logServerError("workspace-locale-seed.load", read.error);
  const publicLocales = language?.publicLocales?.length ? language.publicLocales : null;
  const value = workspaceSeedPrimary({
    rowRead: !read.error && Boolean(read.data),
    defaultLocale: read.data?.default_locale,
    publicLocales,
  });
  // Only a fully successful read is cached, so a transient failure is not pinned.
  if (!read.error && read.data && publicLocales) cache.set(tenantId, { loadedAt: now, value });
  return value;
}

/** Drop the cached value for one tenant (call after the tenant's default language changes). */
export function invalidateWorkspaceSeedPrimary(tenantId: string): void {
  cache.delete(tenantId);
}
