// D2 — Discover hubs endpoint.
//
// GET /api/discover/hubs
//   → 200 { hubs: DiscoverHub[] }
//   → 401 unauthenticated
//
// Returns the list of agency hubs (workspaces with plan_tier ≥ studio)
// that have at least one discoverable talent on their roster. Powers the
// "Hub" filter chip on the buyer surface. Per the spec §12.7 (ratified),
// v1 hubs = Studio / Agency / Network workspaces only — informal scenes
// deferred.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §7 + §12.7.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export type DiscoverHub = {
  /** agencies.id (= tenant_id) */
  id: string;
  displayName: string;
  /** "studio" | "agency" | "network" — Free workspaces are excluded by definition. */
  planTier: "studio" | "agency" | "network";
  /** Count of discoverable + approved talents on this hub's roster. */
  discoverableTalentCount: number;
};

const PLAN_TIER_VALUES = ["studio", "agency", "network"] as const;
type PlanTier = (typeof PLAN_TIER_VALUES)[number];
function isPlanTier(v: string | null | undefined): v is PlanTier {
  return v === "studio" || v === "agency" || v === "network";
}

export async function GET() {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ hubs: [] });
  }

  // Fetch all Studio+ workspaces with their roster of discoverable talents.
  // Free-plan workspaces are excluded by definition — per ratified §12.7,
  // hubs = paid-plan workspaces only for v1.
  const { data, error } = await admin
    .from("agencies")
    .select(
      `
      id, display_name, plan_tier,
      agency_talent_roster!tenant_id (
        talent_profile_id,
        status,
        talent_profiles!talent_profile_id ( is_discoverable, workflow_status )
      )
      `,
    )
    .in("plan_tier", PLAN_TIER_VALUES as unknown as string[])
    .order("display_name", { ascending: true });

  if (error) {
    logServerError("api.discover.hubs", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type Row = {
    id: string;
    display_name: string | null;
    plan_tier: string | null;
    agency_talent_roster: Array<{
      talent_profile_id: string;
      status: string;
      talent_profiles: { is_discoverable: boolean | null; workflow_status: string | null } | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const hubs: DiscoverHub[] = rows
    .map((row) => {
      if (!isPlanTier(row.plan_tier)) return null;
      const roster = row.agency_talent_roster ?? [];
      const discoverableTalentCount = roster.filter((r) => {
        if (r.status !== "active" && r.status !== "pending") return false;
        const p = r.talent_profiles;
        if (!p) return false;
        if (!p.is_discoverable) return false;
        return p.workflow_status === "approved" || p.workflow_status === "published";
      }).length;
      return {
        id: row.id,
        displayName: (row.display_name ?? "").trim() || "Unnamed hub",
        planTier: row.plan_tier,
        discoverableTalentCount,
      };
    })
    .filter((h): h is DiscoverHub => h !== null)
    .filter((h) => h.discoverableTalentCount > 0)
    .sort((a, b) => b.discoverableTalentCount - a.discoverableTalentCount
                  || a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ hubs });
}
