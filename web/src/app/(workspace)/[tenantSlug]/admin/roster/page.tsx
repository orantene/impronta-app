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
import { RosterClientShell } from "./RosterClientShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceRosterPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const [canView, canEdit, roster] = await Promise.all([
    userHasCapability("agency.roster.view", scope.tenantId),
    userHasCapability("agency.roster.edit", scope.tenantId),
    loadWorkspaceRosterEnriched(scope.tenantId),
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

  return (
    <RosterClientShell
      roster={roster}
      tenantSlug={tenantSlug}
      canEdit={canEdit}
      seatUsage={{
        planTier,
        used: roster.length,
        limit: rosterLimit,
      }}
    />
  );
}
