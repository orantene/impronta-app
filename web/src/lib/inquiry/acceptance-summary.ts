/**
 * acceptance-summary — D5.3 helpers for per-owning-party offer
 * acceptance status + top-level lineup rollup.
 *
 * Backed by two SQL functions in migration
 * 20260515191815_d5_3_offer_acceptance_summary.sql:
 *
 *   - acceptance_summary_for_offer(offer_id) → SETOF (party-rollup row)
 *   - lineup_status_summary(inquiry_id)      → SETOF (top-level rollup)
 *
 * Used by:
 *   - Admin shell lineup tab + status sheet (per-tenant pills)
 *   - Client unified lineup view (derived top-level summary banner)
 *
 * Single-tenant inquiries get exactly one party row; cross-tenant
 * inquiries get N rows (one per agency / workspace / independent).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PartyAcceptanceRow = {
  owningPartyType: "agency" | "workspace" | "talent";
  owningPartyId: string;
  talentCount: number;
  acceptedCount: number;
  pendingCount: number;
  declinedCount: number;
  /** Per-party derived status (db-computed). One of:
   *  all_accepted | all_declined | all_pending | mixed | partial */
  derivedStatus: "all_accepted" | "all_declined" | "all_pending" | "mixed" | "partial";
};

export type LineupRollup = {
  totalTalents: number;
  totalAccepted: number;
  totalPending: number;
  totalDeclined: number;
  /** Pre-formatted label suitable for direct rendering. */
  derivedLabel: string;
};

/**
 * Per-owning-party acceptance breakdown for an offer. Returns one row
 * per distinct owning party. Empty array when the offer has no talents
 * yet (or on DB error — caller can default to single-tenant rendering).
 */
export async function loadAcceptanceSummaryForOffer(
  supabase: SupabaseClient,
  offerId: string,
): Promise<PartyAcceptanceRow[]> {
  try {
    const { data, error } = await supabase.rpc("acceptance_summary_for_offer", {
      p_offer_id: offerId,
    });
    if (error) return [];

    type Row = {
      owning_party_type: "agency" | "workspace" | "talent";
      owning_party_id: string;
      talent_count: number;
      accepted_count: number;
      pending_count: number;
      declined_count: number;
      derived_status: PartyAcceptanceRow["derivedStatus"];
    };

    return ((data ?? []) as Row[]).map((r) => ({
      owningPartyType: r.owning_party_type,
      owningPartyId: r.owning_party_id,
      talentCount: r.talent_count,
      acceptedCount: r.accepted_count,
      pendingCount: r.pending_count,
      declinedCount: r.declined_count,
      derivedStatus: r.derived_status,
    }));
  } catch {
    return [];
  }
}

/**
 * Top-level lineup rollup for the inquiry header banner.
 * Falls back to the empty rollup on error.
 */
export async function loadLineupStatusSummary(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<LineupRollup> {
  const empty: LineupRollup = {
    totalTalents: 0,
    totalAccepted: 0,
    totalPending: 0,
    totalDeclined: 0,
    derivedLabel: "No lineup yet",
  };
  try {
    const { data, error } = await supabase.rpc("lineup_status_summary", {
      p_inquiry_id: inquiryId,
    });
    if (error) return empty;
    type Row = {
      total_talents: number;
      total_accepted: number;
      total_pending: number;
      total_declined: number;
      derived_label: string;
    };
    const row = ((data ?? []) as Row[])[0];
    if (!row) return empty;
    return {
      totalTalents: row.total_talents,
      totalAccepted: row.total_accepted,
      totalPending: row.total_pending,
      totalDeclined: row.total_declined,
      derivedLabel: row.derived_label,
    };
  } catch {
    return empty;
  }
}

/**
 * Tone hint for the per-party derived_status. UI uses this to color
 * the pill (green = all_accepted, red = all_declined, etc.).
 */
export function statusTone(
  status: PartyAcceptanceRow["derivedStatus"],
): "success" | "danger" | "warning" | "neutral" {
  switch (status) {
    case "all_accepted":
      return "success";
    case "all_declined":
      return "danger";
    case "all_pending":
      return "neutral";
    case "mixed":
      return "warning";
    case "partial":
      return "warning";
  }
}
