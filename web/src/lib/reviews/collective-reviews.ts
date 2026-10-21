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

/**
 * TUL-1467: the Friends collectives this talent OWNS (her account is an active owner of a workspace that runs as
 * a collective). Her public page collects those workspaces' reviews. Fail-soft: any problem means "owns none".
 */
export async function collectiveTenantIdsOwnedByTalent(db: Db, talentProfileId: string): Promise<string[]> {
  try {
    const { data: tp, error } = await db.from("talent_profiles").select("user_id").eq("id", talentProfileId).maybeSingle();
    const userId = (tp as { user_id?: string | null } | null)?.user_id ?? null;
    if (error || !userId) return [];
    const { data: memberships, error: mErr } = await db
      .from("agency_memberships")
      .select("tenant_id")
      .eq("profile_id", userId)
      .eq("role", "owner")
      .eq("status", "active");
    if (mErr || !Array.isArray(memberships) || memberships.length === 0) return [];
    const tenantIds = [...new Set((memberships as Array<{ tenant_id: string }>).map((m) => m.tenant_id))];
    const { data: agencies, error: aErr } = await db.from("agencies").select("id").in("id", tenantIds).eq("work_model", FRIENDS_COLLECTIVE_MODEL);
    if (aErr || !Array.isArray(agencies)) return [];
    return (agencies as Array<{ id: string }>).map((a) => a.id);
  } catch {
    return [];
  }
}

type OwnerPageReview = { id: string; body: string | null; rating: number; createdAt: string; clientName: string | null };

/**
 * The owner's own reviews plus her collective's, newest first, no duplicates, quote required. The collective's
 * reviews show the quote and the rating only: no client name is carried onto the owner's public page.
 */
export function mergeOwnerPageReviews<T extends OwnerPageReview>(own: readonly T[], collective: readonly T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const ownIds = new Set(own.map((r) => r.id));
  for (const r of [...own, ...collective.map((c) => (ownIds.has(c.id) ? c : { ...c, clientName: null }))]) {
    if (seen.has(r.id) || !r.body?.trim()) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, Math.max(0, limit));
}
