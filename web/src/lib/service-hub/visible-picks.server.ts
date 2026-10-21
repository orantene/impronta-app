import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePublicRosterDisplayCap } from "@/lib/saas/roster-seat-limit";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * TUL-1591 (e): the members an owner can pick to stay visible, and the public cap. The cap
 * is the one the public directory applies (`resolvePublicRosterDisplayCap`), so the screen
 * and the site count the same places. Only ACTIVE, publicly shown members are listed
 * (`site_visible` or `featured`): they are the ones competing for the places. Oldest first.
 * Any read error is null: the screen says it could not load, never shows a partial list.
 */

export type VisiblePickMember = { talentProfileId: string; name: string; picked: boolean; addedAt: string | null };
export type VisiblePicks = { cap: number | null; members: VisiblePickMember[] };

type RosterRow = {
  tenant_id: string;
  talent_profile_id: string;
  agency_visibility: string | null;
  added_at: string | null;
  talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null;
};

export async function loadVisiblePicks(admin: SupabaseClient, tenantId: string): Promise<VisiblePicks | null> {
  try {
    const { data: agency, error: aErr } = await admin.from("agencies").select("plan_tier, talent_seat_limit").eq("id", tenantId).maybeSingle();
    if (aErr || !agency) {
      if (aErr) logServerError("serviceHub.visiblePicks.agency", aErr);
      return null;
    }
    const a = agency as { plan_tier?: string | null; talent_seat_limit?: number | null };
    const cap = resolvePublicRosterDisplayCap(a.plan_tier ?? null, a.talent_seat_limit ?? null);

    const { data: rows, error } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .select("tenant_id, talent_profile_id, agency_visibility, added_at, talent_profiles!inner(display_name)")
      .eq("status", "active")
      .in("agency_visibility", ["site_visible", "featured"])
      .order("added_at", { ascending: true });
    if (error) {
      logServerError("serviceHub.visiblePicks.roster", error);
      return null;
    }
    const members: VisiblePickMember[] = [];
    for (const r of (rows ?? []) as RosterRow[]) {
      if (r.tenant_id !== tenantId) continue; // the second line after the scoped query
      const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
      members.push({
        talentProfileId: r.talent_profile_id,
        name: tp?.display_name?.trim() || "",
        picked: r.agency_visibility === "featured",
        addedAt: r.added_at ?? null,
      });
    }
    return { cap, members };
  } catch (err) {
    logServerError("serviceHub.visiblePicks.load", err);
    return null;
  }
}
