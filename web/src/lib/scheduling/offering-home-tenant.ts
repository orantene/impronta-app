import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-451: the workspace an offering is sold from is the offering's OWN tenant.
 *
 * A talent site is reached on a host whose tenant is not always the tenant the
 * talent's offerings carry: a "both" owner has a business workspace AND a talent
 * workspace, and her offerings and hours live under the workspace she moved
 * them to, while the public page (and so the booking payload) can name the other
 * one. Every tenant-scoped read in the purchase then found no offering, the
 * policy came back empty, the mode fell to "request" and the guest read "This
 * one is booked by request" on a service that is bookable. A "myself" site,
 * where host and offering share a tenant, booked fine on identical data.
 *
 * One rule for myself / both / studio: on a DIRECT talent channel the booking is
 * placed under the tenant the offering row says it belongs to, provided the row
 * is that very talent's offering. Anything else keeps the caller's tenant (and
 * fails exactly as before), so an offering can never be pulled into a workspace
 * by naming it with someone else's talent id.
 */
export async function resolveOfferingHomeTenant(
  admin: SupabaseClient,
  input: { offeringId: string; talentProfileId: string; tenantId: string },
): Promise<{ ok: true; tenantId: string } | { ok: false }> {
  // eslint-disable-next-line ratchet/no-untenanted-from -- the point of this read: find the tenant the offering itself carries
  const { data, error } = await admin
    .from("talent_offerings")
    .select("tenant_id, talent_profile_id")
    .eq("id", input.offeringId)
    .maybeSingle();
  if (error) {
    logServerError("offeringHomeTenant.read", error);
    return { ok: false };
  }
  const row = data as { tenant_id?: unknown; talent_profile_id?: unknown } | null;
  if (!row || row.talent_profile_id !== input.talentProfileId) return { ok: true, tenantId: input.tenantId };
  return { ok: true, tenantId: typeof row.tenant_id === "string" && row.tenant_id ? row.tenant_id : input.tenantId };
}
