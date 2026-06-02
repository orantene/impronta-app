import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * M2.3 — Per-requirement-group fulfillment readiness.
 *
 * Audit #1 (2026-06): a requirement group is "fulfilled" when every talent who
 * is ON THE CURRENT OFFER (has an `inquiry_offer_line_items` row, mapped to a
 * participant in that group) has an `accepted` `inquiry_approvals` row for the
 * offer. The gate counts the OFFERED headcount — the same set
 * `engine_send_offer` seeds approvals for — NOT the stored, drift-prone
 * `inquiry_requirement_groups.quantity_required`.
 *
 * This module is the single source of truth on the TS side. The server-side
 * RPC `engine_inquiry_group_shortfall(p_inquiry_id)` is the canonical computer
 * — we re-use its output verbatim so UI readiness and RPC gating never drift.
 *
 * Shape returned by the RPC:
 *   [
 *     {
 *       "group_id": "<uuid>",
 *       "role_key": "hosts",
 *       "quantity_required": 2,   // offered headcount (keeps shortfall = required - approved)
 *       "offered_count": 2,       // same value, explicit
 *       "approved_count": 1,
 *       "shortfall": 1
 *     },
 *     ...
 *   ]
 *
 * Only groups with `shortfall > 0` are included. An empty array means "every
 * group is fulfilled" — i.e. conversion may proceed without override.
 *
 * Callers MUST NOT hand-roll this computation — always go through this helper
 * (or the RPC directly) so legacy/migrated single-group inquiries and
 * multi-group inquiries behave identically.
 */

export type GroupShortfall = {
  group_id: string;
  role_key: string;
  /** Offered headcount for the group (= `offered_count`); preserves `shortfall = quantity_required - approved_count`. */
  quantity_required: number;
  /** Talents on the current offer assigned to this group. Absent on legacy payloads. */
  offered_count?: number;
  approved_count: number;
  shortfall: number;
};

export type FulfillmentReadiness = {
  fulfilled: boolean;
  shortfall: GroupShortfall[];
};

function parseShortfall(data: unknown): GroupShortfall[] {
  if (!Array.isArray(data)) return [];
  const out: GroupShortfall[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const group_id = typeof r.group_id === "string" ? r.group_id : null;
    const role_key = typeof r.role_key === "string" ? r.role_key : null;
    const quantity_required = typeof r.quantity_required === "number" ? r.quantity_required : null;
    const approved_count = typeof r.approved_count === "number" ? r.approved_count : null;
    const shortfall = typeof r.shortfall === "number" ? r.shortfall : null;
    if (
      group_id == null ||
      role_key == null ||
      quantity_required == null ||
      approved_count == null ||
      shortfall == null
    ) {
      continue;
    }
    const offered_count = typeof r.offered_count === "number" ? r.offered_count : quantity_required;
    out.push({ group_id, role_key, quantity_required, offered_count, approved_count, shortfall });
  }
  return out;
}

/**
 * Fetch the shortfall payload for an inquiry. Never throws — RPC errors map
 * to a conservative `fulfilled: false, shortfall: []` so readiness UI fails
 * closed (we never falsely claim fulfillment on an error).
 */
export async function getInquiryGroupShortfall(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<FulfillmentReadiness> {
  const { data, error } = await supabase.rpc("engine_inquiry_group_shortfall", {
    p_inquiry_id: inquiryId,
  });
  if (error) {
    return { fulfilled: false, shortfall: [] };
  }
  const shortfall = parseShortfall(data);
  return { fulfilled: shortfall.length === 0, shortfall };
}
