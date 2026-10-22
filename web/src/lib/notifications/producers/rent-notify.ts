import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { afterResponse } from "@/lib/server/after-response";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * TUL-1590: the plan must belong to THIS workspace and THIS talent, or nothing is read or sent
 * (otherwise a mismatched id would put another tenant's talent name into the email). Fails closed.
 */
export async function rentPlanBelongsToTenant(
  admin: Pick<SupabaseClient, "from">,
  p: { tenantId: string; planId: string; talentProfileId: string },
): Promise<boolean> {
  try {
    const { data, error } = await tenantScopedQuery(admin as SupabaseClient, "studio_rent_plans", p.tenantId)
      .select("id")
      .eq("id", p.planId)
      .eq("talent_profile_id", p.talentProfileId)
      .maybeSingle();
    if (error) {
      logServerError("rentPlanBelongsToTenant", error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    logServerError("rentPlanBelongsToTenant", err);
    return false;
  }
}

/**
 * TUL-1448: tell the workspace owner (email + bell) when a member declines a proposed station
 * rent or ends an active plan. Fire-and-forget and idempotent: the eventId is plan id + outcome.
 * Call it AFTER the plan row was updated and audited; it never throws.
 */
export async function notifyRentPlanMemberResponse(params: {
  admin: SupabaseClient;
  tenantId: string;
  planId: string;
  talentProfileId: string;
  outcome: "declined" | "ended";
}): Promise<void> {
  const { admin, tenantId, planId, talentProfileId, outcome } = params;
  try {
    if (!(await rentPlanBelongsToTenant(admin, { tenantId, planId, talentProfileId }))) return;
    const [agency, talent] = await Promise.all([
      admin.from("agencies").select("slug").eq("id", tenantId).maybeSingle(),
      admin.from("talent_profiles").select("display_name").eq("id", talentProfileId).maybeSingle(),
    ]);
    if (agency.error || talent.error) {
      logServerError("notifyRentPlanMemberResponse.read", agency.error ?? talent.error);
      return;
    }
    const slug = (agency.data as { slug?: string | null } | null)?.slug ?? null;
    const memberName = (talent.data as { display_name?: string | null } | null)?.display_name ?? null;
    const rentUrl = slug ? `${getAppUrl()}/${encodeURIComponent(slug)}/admin/settings/rent` : getAppUrl();
    afterResponse(() =>
      dispatchEventNotifications({
        type: outcome === "declined" ? "rent.plan_declined" : "rent.plan_ended_by_member",
        tenantId,
        eventId: `rent-plan:${planId}:${outcome}`,
        payload: { memberName, rentUrl },
      }).catch((err) => logServerError("notifyRentPlanMemberResponse.dispatch", err)),
    );
  } catch (err) {
    logServerError("notifyRentPlanMemberResponse", err);
  }
}
