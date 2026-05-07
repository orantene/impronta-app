// Phase 3 — canonical workspace roster page.
// Server Component — no "use client".
//
// Loads enriched roster (with primaryTypeLabel) and hands off to
// RosterClientShell which handles all filtering / sorting / view state.
// Capability gate: agency.roster.view.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceRosterEnriched } from "../../_data-bridge";
import {
  resolvePublicRosterDisplayCap,
} from "@/lib/saas/roster-seat-limit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { RosterClientShell } from "./RosterClientShell";

async function loadTalentTypes() {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("id, name_en")
    .eq("kind", "talent_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (error) { logServerError("roster.loadTalentTypes", error); return []; }
  return (data ?? []).map((t) => ({ id: t.id as string, name_en: t.name_en as string }));
}

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ filter?: string }>;

const STATE_FILTERS = new Set(["all","published","awaiting-approval","claimed","invited","draft"]);

export default async function WorkspaceRosterPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { filter } = await searchParams;
  const initialStateFilter = (filter && STATE_FILTERS.has(filter) ? filter : "all") as "all" | "published" | "awaiting-approval" | "claimed" | "invited" | "draft";

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const session = await getCachedActorSession();
  const currentUserId = session.user?.id ?? null;

  const [canView, canEdit, roster, talentTypes] = await Promise.all([
    userHasCapability("agency.roster.view", scope.tenantId),
    userHasCapability("agency.roster.edit", scope.tenantId),
    loadWorkspaceRosterEnriched(scope.tenantId),
    loadTalentTypes(),
  ]);

  if (!canView) notFound();

  const admin = createServiceRoleClient();
  const agency = admin
    ? await admin
        .from("agencies")
        .select("plan_tier, talent_seat_limit")
        .eq("id", scope.tenantId)
        .maybeSingle<{ plan_tier: string | null; talent_seat_limit: number | null }>()
    : null;
  const planTier = agency?.data?.plan_tier ?? null;
  const rosterLimit = resolvePublicRosterDisplayCap(
    planTier,
    agency?.data?.talent_seat_limit ?? null,
  );

  // Check if the signed-in admin is also a talent on this roster.
  // Note: `talent_profiles!talent_profile_id` is a forward many-to-one FK,
  // so Supabase returns a single object (or null), NOT an array.
  let isOnRoster = false;
  if (currentUserId) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data: rosterCheck } = await supabase
        .from("agency_talent_roster")
        .select("id, talent_profiles!talent_profile_id ( user_id )")
        .eq("tenant_id", scope.tenantId)
        .neq("status", "removed")
        .limit(200);
      const rows = (rosterCheck ?? []) as Array<{
        talent_profiles: { user_id?: string | null } | null;
      }>;
      isOnRoster = rows.some((row) => row.talent_profiles?.user_id === currentUserId);
    }
  }

  return (
    <RosterClientShell
      roster={roster}
      tenantSlug={tenantSlug}
      canEdit={canEdit}
      talentTypes={talentTypes}
      initialStateFilter={initialStateFilter}
      isOnRoster={isOnRoster}
      seatUsage={{
        planTier,
        used: roster.length,
        limit: rosterLimit,
      }}
    />
  );
}
