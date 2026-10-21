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
type Env = Record<string, string | undefined>;

/**
 * TUL-1591 (b): reviews follow the workspace model (TUL-1365 / `reviewRoute` in #4178).
 * Coordinator agency and friends collective: the public review sits on the workspace entry
 * and the talent keeps it privately (her own reviews view and private notes are unchanged).
 * Team studio: on the workspace entry, labelled "with <talent>". Open network and rental
 * studio: on the talent, as today. OFF by default (`HUB_REVIEW_ROUTING_ENABLED=1` turns it
 * on): it moves live reviews off talents' public pages, so until then only Friends
 * collectives do (TUL-1374, unchanged).
 */
export function hubReviewRoutingEnabled(env: Env = process.env): boolean {
  return env.HUB_REVIEW_ROUTING_ENABLED === "1";
}

const WORKSPACE_REVIEWED_MODELS = ["coordinator_agency", FRIENDS_COLLECTIVE_MODEL, "team_studio"] as const;
const STUDIO_LABEL_MODEL = "team_studio";

/** The models whose reviews leave the member's own public page. */
export function workspaceReviewedModels(env: Env = process.env): readonly string[] {
  return hubReviewRoutingEnabled(env) ? WORKSPACE_REVIEWED_MODELS : [FRIENDS_COLLECTIVE_MODEL];
}

/** The studio entry's "with <talent>" line. null when there is no name to show. */
export function workspaceReviewWithLabel(talentName: string | null | undefined, locale: string): string | null {
  const name = talentName?.trim();
  if (!name) return null;
  return locale.toLowerCase().startsWith("es") ? `con ${name}` : `with ${name}`;
}

/**
 * The talent's rostered workspaces whose model takes her reviews off her own public page
 * (Friends collectives; with TUL-1591 routing on, every workspace-reviewed model).
 */
export async function collectiveTenantIdsForTalent(db: Db, talentProfileId: string, env: Env = process.env): Promise<string[]> {
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
      .in("work_model", [...workspaceReviewedModels(env)]);
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
  /** Team studio only (TUL-1591): the talent shown as "with <talent>". null otherwise. */
  withTalentName: string | null;
};

/** Published reviews earned inside one workspace, newest first, for the workspace's page. */
export async function loadWorkspaceReviews(db: Db, tenantId: string, limit = 12, opts: { workModel?: string | null } = {}): Promise<WorkspaceReview[]> {
  try {
    const { data, error } = await db
      .from("talent_reviews")
      .select("id, talent_profile_id, client_user_id, rating, body, anon, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    const rows = data as Array<{ id: string; talent_profile_id: string; client_user_id: string; rating: number; body: string | null; anon: boolean; created_at: string }>;
    // Team studio: the entry reads "with <talent>". Names are read only then; a failed read keeps the reviews without a label.
    const names = new Map<string, string>();
    if (opts.workModel === STUDIO_LABEL_MODEL && rows.length > 0) {
      const { data: people, error: nErr } = await db.from("talent_profiles").select("id, display_name").in("id", [...new Set(rows.map((r) => r.talent_profile_id))]);
      if (!nErr && Array.isArray(people)) {
        for (const p of people as Array<{ id: string; display_name: string | null }>) if (p.display_name?.trim()) names.set(p.id, p.display_name.trim());
      }
    }
    return rows.map((r) => ({
      id: r.id,
      talentProfileId: r.talent_profile_id,
      clientUserId: r.client_user_id,
      rating: r.rating,
      body: r.body,
      anon: r.anon === true,
      createdAt: r.created_at,
      withTalentName: names.get(r.talent_profile_id) ?? null,
    }));
  } catch {
    return [];
  }
}
