/**
 * TUL-1374: reviews in a Friends collective. The reviews earned inside a
 * collective workspace are collected on the OWNER's page; a member does not show
 * them publicly on her own page (she still sees them privately in her own
 * reviews view). This module answers which workspaces hide a talent's reviews
 * and loads a workspace's reviews for the owner's page.
 *
 * Every read is fail-soft: a failure (including the work_model column not
 * existing before the held migration) hides nothing, so public pages never break.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FRIENDS_COLLECTIVE_MODEL } from "@/lib/service-hub/friends-collective";

type Db = Pick<SupabaseClient, "from">;

/** The talent's rostered workspaces that run as a Friends collective. */
export async function collectiveTenantIdsForTalent(db: Db, talentProfileId: string): Promise<string[]> {
  try {
    const { data: roster, error } = await db
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed");
    if (error || !Array.isArray(roster) || roster.length === 0) return [];
    const tenantIds = [...new Set((roster as Array<{ tenant_id: string }>).map((r) => r.tenant_id))];
    const { data: agencies, error: aErr } = await db
      .from("agencies")
      .select("id")
      .in("id", tenantIds)
      .eq("work_model", FRIENDS_COLLECTIVE_MODEL);
    if (aErr || !Array.isArray(agencies)) return [];
    return (agencies as Array<{ id: string }>).map((a) => a.id);
  } catch {
    return [];
  }
}

/** PostgREST `not.in` value: "(a,b)". Ids are uuids from our own tables. */
export function notInTenantsFilter(ids: readonly string[]): string {
  return `(${ids.join(",")})`;
}

export type WorkspaceReview = {
  id: string;
  talentProfileId: string;
  clientUserId: string;
  rating: number;
  body: string | null;
  anon: boolean;
  createdAt: string;
};

/** Published reviews earned inside one workspace, newest first, for the owner's page. */
export async function loadWorkspaceReviews(db: Db, tenantId: string, limit = 12): Promise<WorkspaceReview[]> {
  try {
    const { data, error } = await db
      .from("talent_reviews")
      .select("id, talent_profile_id, client_user_id, rating, body, anon, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Array<{ id: string; talent_profile_id: string; client_user_id: string; rating: number; body: string | null; anon: boolean; created_at: string }>).map((r) => ({
      id: r.id,
      talentProfileId: r.talent_profile_id,
      clientUserId: r.client_user_id,
      rating: r.rating,
      body: r.body,
      anon: r.anon === true,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}
