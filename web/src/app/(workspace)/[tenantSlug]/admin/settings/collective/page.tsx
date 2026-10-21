// Workspace Settings → Friends collective (TUL-1374).
// Where the OWNER turns the model on and sets what she takes from each member.
// Lives under the existing `settings` segment (like Reservations): no rail slot.
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { collectiveSplitEnabled, parseOwnerShareRow } from "@/lib/service-hub/collective-split";
import { FRIENDS_COLLECTIVE_MODEL } from "@/lib/service-hub/friends-collective";
import { loadWorkspaceReviews } from "@/lib/reviews/collective-reviews";
import { CollectiveSharesCard, type CollectiveMember, type CollectiveReview } from "./CollectiveSharesCard";
import { logServerError } from "@/lib/server/safe-error";
import { canSetWorkStyle } from "@/lib/service-hub/work-style";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";

export const dynamic = "force-dynamic";

export default async function CollectiveSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const admin = createServiceRoleClient();

  // Members' shares and the reviews are for the owner and admins only (an editor or viewer
  // reads neither); the owner-only actions behind the card re-check on their own.
  const guard = await requireWorkspaceStaffAction({ capability: "agency.workspace.view" });
  if (!guard.ok || guard.tenantId !== scope.tenantId) notFound();
  if (admin) {
    const { data: me, error: meErr } = await tenantScopedQuery(admin, "agency_memberships", scope.tenantId)
      .select("role")
      .eq("profile_id", guard.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (meErr || !canSetWorkStyle((me as { role?: string } | null)?.role)) notFound();
  }

  let workModel: string | null = null;
  const members: CollectiveMember[] = [];
  const reviews: CollectiveReview[] = [];
  if (admin) {
    const { data: agency, error: agencyErr } = await admin.from("agencies").select("work_model").eq("id", scope.tenantId).maybeSingle();
    if (agencyErr) logServerError("collective-settings.work-model", agencyErr);
    workModel = (agency as { work_model?: string | null } | null)?.work_model ?? null;
    if (workModel === FRIENDS_COLLECTIVE_MODEL) {
      for (const r of await loadWorkspaceReviews(admin, scope.tenantId, 10)) {
        reviews.push({ id: r.id, rating: r.rating, body: r.body ?? "" });
      }
      const { data: rows } = await tenantScopedQuery(admin, "agency_talent_roster", scope.tenantId)
        .select("talent_profile_id, owner_share_kind, owner_share_bps, owner_share_cents, owner_share_currency, pending_share_kind, pending_share_bps, pending_share_cents, pending_share_currency, talent_profiles!inner(display_name)")
        .neq("status", "removed");
      for (const r of (rows ?? []) as Array<Record<string, unknown> & { talent_profile_id: string; talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }>) {
        const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
        members.push({
          talentProfileId: r.talent_profile_id,
          name: tp?.display_name ?? "",
          share: parseOwnerShareRow({ owner_share_kind: r.owner_share_kind, owner_share_bps: r.owner_share_bps, owner_share_cents: r.owner_share_cents, owner_share_currency: r.owner_share_currency }),
          pending: parseOwnerShareRow({ owner_share_kind: r.pending_share_kind, owner_share_bps: r.pending_share_bps, owner_share_cents: r.pending_share_cents, owner_share_currency: r.pending_share_currency }),
        });
      }
    }
  }
  return (
    <main style={{ padding: 24, maxWidth: 820, fontFamily: "Inter, system-ui, sans-serif" }}>
      <CollectiveSharesCard locale={locale} isCollective={workModel === FRIENDS_COLLECTIVE_MODEL} members={members} reviews={reviews} splitOn={collectiveSplitEnabled()} />
    </main>
  );
}
