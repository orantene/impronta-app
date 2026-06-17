import "server-only";

import { cache } from "react";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/inquiries-workspace.ts — workspace-side Work queue listing.
 *
 * Split out of `_data-bridge.ts` (rev 13). Distinct from
 * `inquiries-messages.ts` which loads richer per-thread data for the
 * messages inbox. This file is the simple "open inquiries" board view.
 *
 * The `INQUIRY_CLOSED_STATUSES` constant is exported for reuse by
 * `inquiries-messages.ts` (the only other domain that filters by it).
 */

/** Terminal statuses excluded from the open Work queue. */
export const INQUIRY_CLOSED_STATUSES = [
  "booked",
  "rejected",
  "expired",
  "closed_lost",
  "archived",
  "converted", // legacy alias for booked
  "closed",    // legacy alias for closed_lost
] as const;

export type WorkspaceInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  /** next_action_by value: 'admin' | 'coordinator' | 'client' | 'talent' | null */
  next_action_by: string | null;
  /** Inquiry source channel — renamed from `source` to match the actual DB column. */
  source_channel: string | null;
  /**
   * Coordinator of record. NULL when the 3-tier assignment fallback found no
   * default coordinator / owner (`agency_manual_pickup`) — these inquiries
   * have nobody driving them and need an admin to claim one. Surfaced as the
   * triage "Unassigned" bucket.
   */
  coordinator_id: string | null;
};

/**
 * Load open inquiries for the Work page. Returns inquiries excluding terminal
 * statuses, ordered by recency (newest first). Capped at 200 rows — the Work
 * page is a live queue view, not a full archive.
 *
 * Returns [] on error or empty queue. Never falls back to mock data.
 *
 * Wrapped in React `cache()` so repeated calls with the same tenantId within
 * one RSC render (e.g. layout → triage page) share one DB round-trip.
 * Pure per-request read; safe to cache for the request lifetime.
 */
export const loadWorkspaceInquiries = cache(async function loadWorkspaceInquiries(
  tenantId: string,
): Promise<WorkspaceInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select(
        // `inquiries.source` doesn't exist — the real columns are `source_channel`,
        // `source_type`, `source_page`, `source_workspace_id`, `source_pitch_id`.
        // Use `source_channel` which is the most user-facing identifier.
        "id, status, contact_name, company, event_date, event_location, quantity, created_at, next_action_by, source_channel, coordinator_id",
      )
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("workspace.loadInquiries", error);
      return [];
    }

    return (data ?? []) as WorkspaceInquiryRow[];
  } catch (err) {
    logServerError("workspace.loadInquiries", err);
    return [];
  }
});
