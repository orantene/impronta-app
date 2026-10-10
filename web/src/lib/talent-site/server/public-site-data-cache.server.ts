import "server-only";

import { unstable_cache } from "next/cache";

import { tagForTalentSite } from "@/lib/talent-site/cache-tags";

/**
 * Cross-request Data Cache for PUBLIC Max-site rows (TUL-444 B1 Step 2).
 *
 * Keys are talent + part only — NEVER a guest id, session, cookie, or IP.
 * Tagged with `talent:<id>:site` so `bustTalentSiteCache` on publish clears it.
 * Outside the Next request runtime (tsx tests), `unstable_cache` throws or is
 * a no-op; we fall through to the loader so unit timing still hits Supabase.
 *
 * Owner draft preview, history/theme-update preview, and the edit canvas MUST
 * pass `bypass: true` — otherwise a save can look stale for up to the TTL.
 */
const KEY_PREFIX = "talent-site:public-data:v1";

export async function cachePublicTalentSiteData<T>(
  talentProfileId: string,
  part: string,
  keyParts: readonly string[],
  load: () => Promise<T>,
  opts?: { revalidate?: number; bypass?: boolean },
): Promise<T> {
  if (!talentProfileId || opts?.bypass) return load();
  const revalidate = opts?.revalidate ?? 300;
  try {
    // Must await: outside a Next request, unstable_cache rejects (async), not throw.
    return await unstable_cache(
      load,
      [KEY_PREFIX, part, talentProfileId, ...keyParts],
      {
        tags: [tagForTalentSite(talentProfileId, "site")],
        revalidate,
      },
    )();
  } catch {
    return load();
  }
}
