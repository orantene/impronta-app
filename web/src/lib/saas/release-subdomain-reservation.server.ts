import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Release the subdomain TTL reservation this lead was holding.
 *
 * MUST run BEFORE the `agencies` insert. `platform_subdomain_label_taken()`
 * (migration 20261231280000) counts any unexpired reservation as "label taken"
 * and has no lead exclusion — a reservation is keyed by lead and predates the
 * tenant, so `p_exclude_tenant_id` cannot match it either. Held past the insert,
 * a signup collides with its OWN reservation: the namespace trigger rejects the
 * insert (23505), and callers that pre-check the RPC silently rename the
 * workspace to `<slug>-2`. Releasing it here is also what the reservation means
 * — it holds the label only until we claim it, after which `agencies.slug`
 * does. Deletes by `lead_id` so a changed slug still releases the right row.
 * Best-effort: logged, never fatal. Pinned by
 * signup-releases-reservation-before-insert.test.ts.
 */
export async function releaseSubdomainReservationForLead(
  admin: SupabaseClient,
  leadId: string,
): Promise<void> {
  const { error } = await admin
    .from("saas_subdomain_reservations")
    .delete()
    .eq("lead_id", leadId);

  if (error) {
    logServerError("workspace-signup.releaseReservation", error);
  }
}
