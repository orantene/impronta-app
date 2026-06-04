import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/talent-coordinator-inquiries.ts — hub self-coordination lookup.
 *
 * A talent can ALSO be the coordinator on an inquiry (an independent /
 * open-hub booking the engine auto-promotes them to run, or one an agency
 * adds them to). The talent-facing RLS (`inquiry_participants_talent_select`)
 * only returns `role='talent'` rows, so a user-scoped query never sees the
 * coordinator role. Both talent-inbox loaders resolve it here with the
 * service-role client, keyed on `user_id` (a coordinator participant always
 * carries a claimed account — the private-thread RLS keys on user_id too).
 *
 * Pure read of inquiry summary columns; the caller merges these into its row
 * shape (flipping `iAmCoordinator` on lineup rows + appending coordinator-only
 * inquiries). Extracted so neither loader trips the 800-line `max-lines` cap.
 */
export type CoordinatorInquiry = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  message: string | null;
  event_date: string | null;
  event_location: string | null;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  trust_level_at_submission: "basic" | "verified" | "silver" | "gold" | null;
  source_channel: string | null;
};

/**
 * Load every inquiry the given user coordinates, optionally scoped to one
 * tenant (the per-tenant loader passes a tenantId; the cross-agency loader
 * omits it). Returns [] when the service-role client is unavailable or on any
 * error — coordinator surfacing is additive, never blocking.
 */
export async function loadCoordinatorInquiriesForUser(
  userId: string,
  tenantId?: string,
): Promise<CoordinatorInquiry[]> {
  try {
    const trusted = createServiceRoleClient();
    if (!trusted) return [];
    let query = trusted
      .from("inquiry_participants")
      .select(`
        inquiries!inner (
          id, status, contact_name, company, message, event_date,
          event_location, created_at, updated_at, tenant_id,
          trust_level_at_submission, source_channel
        )
      `)
      .eq("user_id", userId)
      .eq("role", "coordinator")
      .in("status", ["invited", "active"])
      .limit(200);
    if (tenantId) query = query.eq("inquiries.tenant_id", tenantId);
    const { data } = await query;
    return ((data ?? []) as unknown as { inquiries: CoordinatorInquiry | null }[])
      .map((r) => r.inquiries)
      .filter((i): i is CoordinatorInquiry => i != null);
  } catch (err) {
    logServerError("talent.loadCoordinatorInquiriesForUser", err);
    return [];
  }
}
