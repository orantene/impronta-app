import type { SupabaseClient } from "@supabase/supabase-js";
import { parseReservationStamp } from "./reservation-intent";
import { assertTalentReservationAllowed } from "./booking-surface";

/**
 * Closes the offering_request hole: a crafted POST cannot book a
 * policy-off talent. Shares the keystone with slots + display.
 */
export async function refuseOfferingRequestIfPolicyOff(
  supabase: SupabaseClient,
  input: {
    source_channel: string;
    talent_profile_ids: string[];
    source_context?: Record<string, unknown> | null;
    source_workspace_id?: string | null;
    tenant_id: string;
  },
): Promise<{ forbidden: true; error: string } | null> {
  if (input.source_channel !== "offering_request") return null;
  // Transitional: older menu orders stamped offering_request + menu_order
  // context before the menu_order enum existed. Still not a talent reservation.
  const ctx = input.source_context;
  if (ctx && typeof ctx === "object" && ctx.menu_order != null) return null;
  const talentId = input.talent_profile_ids[0];
  if (!talentId) return { forbidden: true, error: "This time cannot be booked." };
  const hostKind =
    ctx && typeof ctx.host_kind === "string" ? ctx.host_kind : "agency";
  const hostTenant =
    (ctx && typeof ctx.host_tenant_id === "string" ? ctx.host_tenant_id : null) ||
    input.source_workspace_id ||
    input.tenant_id;
  const gate = await assertTalentReservationAllowed(supabase, {
    talentProfileId: talentId,
    offeringId: parseReservationStamp(input.source_context)?.offering_id ?? null,
    host: { kind: hostKind, tenantId: hostTenant },
  });
  if (!gate.ok) return { forbidden: true, error: gate.error };
  return null;
}
