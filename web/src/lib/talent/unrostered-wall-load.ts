import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { talentSiteRowIsOwnSite, type UnrosteredWallFacts } from "@/lib/talent/unrostered-wall";

export type UnrosteredWallRead = UnrosteredWallFacts & {
  /** False when the roster/site read failed. Absence is not proven. */
  proven: boolean;
};

type SiteRow = {
  status?: string | null;
  site_published_at?: string | null;
  published_snapshot?: unknown;
};

async function readFacts(
  client: SupabaseClient,
  profileId: string,
): Promise<UnrosteredWallRead> {
  const [roster, site] = await Promise.all([
    client
      .from("agency_talent_roster")
      .select("status")
      .eq("talent_profile_id", profileId)
      .in("status", ["active", "pending"])
      .limit(1),
    client
      .from("talent_sites")
      .select("status, site_published_at, published_snapshot")
      .eq("talent_profile_id", profileId)
      .limit(1),
  ]);

  if (roster.error || site.error) {
    if (roster.error) logServerError("talent.unrosteredWall.roster", roster.error);
    if (site.error) logServerError("talent.unrosteredWall.site", site.error);
    return { hasRoster: false, hasOwnSite: false, proven: false };
  }

  const row = (site.data?.[0] ?? null) as SiteRow | null;
  return {
    hasRoster: (roster.data?.length ?? 0) > 0,
    hasOwnSite: talentSiteRowIsOwnSite(
      row
        ? {
            status: row.status,
            sitePublishedAt: row.site_published_at,
            hasPublishedSnapshot: row.published_snapshot != null,
          }
        : null,
    ),
    proven: true,
  };
}

/**
 * Roster + own-site facts for the talent home wall.
 * Service role when it is configured; otherwise the signed-in client,
 * which can read the owner's own rows.
 */
export async function loadUnrosteredWallFacts(profileId: string): Promise<UnrosteredWallRead> {
  const admin = createServiceRoleClient();
  const user = admin ? null : await getCachedServerSupabase();
  const client = admin ?? user;
  if (!client) return { hasRoster: false, hasOwnSite: false, proven: false };
  return readFacts(client, profileId);
}
