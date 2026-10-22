import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePublicRosterDisplayCap } from "@/lib/saas/roster-seat-limit";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

import { visibleRosterIdsWithinCap } from "./roster-visibility";
import { visibilityByMember, visiblePicksEnabled, type PickVisibility } from "./visible-picks";

/**
 * TUL-1591 (e): the members an owner can pick to stay visible, and the public cap. The cap
 * is the one the public directory applies (`resolvePublicRosterDisplayCap`), so the screen
 * and the site count the same places. Only ACTIVE, publicly shown members are listed
 * (`site_visible` or `featured`): they are the ones competing for the places. Oldest first.
 * Any read error is null: the screen says it could not load, never shows a partial list.
 *
 * TUL-1693: `picked` is the roster's own `keep_visible`, never `featured`. While that
 * column is not migrated, the list still loads but fails closed: nobody is shown as kept
 * and `pickAvailable` is false (the screen says picks are not available yet).
 *
 * TUL-1687: `visibility` labels each member visible or hidden (over the cap) with the
 * directory's own rule (`visibleRosterIdsWithinCap`, same roster ids, same cap), so the
 * screen says exactly what the public site shows. While keep_visible is not migrated
 * that rule falls back to 'featured', and so do the labels. No restriction, or any read
 * error, is an empty map: nobody is labelled, never wrongly "hidden".
 */

export type VisiblePickMember = { talentProfileId: string; name: string; picked: boolean; addedAt: string | null };
export type VisiblePicks = { cap: number | null; members: VisiblePickMember[]; pickAvailable: boolean; visibility: Record<string, PickVisibility> };

type RosterRow = {
  tenant_id: string;
  talent_profile_id: string;
  agency_visibility: string | null;
  keep_visible?: boolean | null;
  added_at: string | null;
  talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null;
};

async function loadMemberVisibility(
  admin: SupabaseClient,
  tenantId: string,
  cap: number | null,
  memberIds: string[],
  env: Record<string, string | undefined>,
): Promise<Record<string, PickVisibility>> {
  // Flag off, unlimited, or nobody listed: no restriction, so no reads and no labels.
  if (!visiblePicksEnabled(env) || cap == null || memberIds.length === 0) return {};
  try {
    // The same roster ids and cap the public directory uses (fetch-directory-page).
    const rosterIds = await listTalentIdsOnTenantRoster(admin, tenantId);
    const visibleIds = await visibleRosterIdsWithinCap(admin, tenantId, rosterIds, cap, env);
    return visibilityByMember(memberIds, rosterIds, visibleIds);
  } catch (err) {
    logServerError("serviceHub.visiblePicks.visibility", err);
    return {};
  }
}

export async function loadVisiblePicks(
  admin: SupabaseClient,
  tenantId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<VisiblePicks | null> {
  try {
    const { data: agency, error: aErr } = await admin.from("agencies").select("plan_tier, talent_seat_limit").eq("id", tenantId).maybeSingle();
    if (aErr || !agency) {
      if (aErr) logServerError("serviceHub.visiblePicks.agency", aErr);
      return null;
    }
    const a = agency as { plan_tier?: string | null; talent_seat_limit?: number | null };
    const cap = resolvePublicRosterDisplayCap(a.plan_tier ?? null, a.talent_seat_limit ?? null);

    const readRoster = (withPick: boolean) =>
      tenantScopedQuery(admin, "agency_talent_roster", tenantId)
        .select(`tenant_id, talent_profile_id, agency_visibility, ${withPick ? "keep_visible, " : ""}added_at, talent_profiles!inner(display_name)`)
        .eq("status", "active")
        .in("agency_visibility", ["site_visible", "featured"])
        .order("added_at", { ascending: true });
    let pickAvailable = true;
    let { data: rows, error } = await readRoster(true);
    if (error && isPostgrestMissingColumnError(error)) {
      // keep_visible not migrated yet (TUL-1693): fail closed, nobody is kept.
      pickAvailable = false;
      ({ data: rows, error } = await readRoster(false));
    }
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
        picked: pickAvailable && r.keep_visible === true,
        addedAt: r.added_at ?? null,
      });
    }
    const visibility = await loadMemberVisibility(admin, tenantId, cap, members.map((m) => m.talentProfileId), env);
    return { cap, members, pickAvailable, visibility };
  } catch (err) {
    logServerError("serviceHub.visiblePicks.load", err);
    return null;
  }
}
