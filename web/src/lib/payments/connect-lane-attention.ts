/**
 * A workspace leg whose payee account lives on another Stripe lane than the charge is a
 * clear HOLD: `legLastError` records the charge lane in the leg's note, and
 * `getConnectLaneAttention` reads it back for the workspace admin's notice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { failureNote } from "./payout-transfer-retry";
import type { TransferOutcome } from "./transfers";

export const CONNECT_LANE_ATTENTION_MARKER = "needs_attention:connect_lane:";

export function legLastError(o: Pick<TransferOutcome, "status" | "detail" | "chargePlatform" | "deterministic">): string | null {
  // A deterministic refusal tells the release path to use a NEW key next time (payout-transfer-retry.ts).
  if (o.status === "failed") return o.deterministic ? failureNote(o.detail ?? "transfer failed", 0, true) : (o.detail ?? "transfer failed");
  if (o.status === "skipped_cross_platform") {
    // The marker lets the workspace admin say exactly which lane's payout account to connect.
    const marker = o.chargePlatform ? ` [${CONNECT_LANE_ATTENTION_MARKER}${o.chargePlatform}]` : "";
    return `cross-platform hold: ${o.detail ?? "recipient account is on another Stripe platform"}${marker}`;
  }
  return null;
}

/**
 * Held legs that wait on a payout account for a SPECIFIC lane (the charge ran on
 * one Stripe platform, the payee's account lives on another). Grouped by lane and
 * currency, for the "Connect the business's <lane> payout account to release $X"
 * notice. Reads the marker `legLastError` stamps on a cross-platform hold.
 */
export async function getConnectLaneAttention(
  target: { tenantId: string },
  sbIn?: SupabaseClient | null,
): Promise<Array<{ lane: string; currency: string; amountCents: number; count: number }>> {
  const sb = sbIn ?? createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("booking_payouts")
      .select("amount_cents, currency, last_error")
      .eq("tenant_id", target.tenantId)
      .eq("party", "workspace")
      .eq("status", "held")
      .like("last_error", "%needs_attention:connect_lane:%");
    if (error) {
      logServerError("booking-payouts-ledger.getConnectLaneAttention", error);
      return [];
    }
    const groups = new Map<string, { lane: string; currency: string; amountCents: number; count: number }>();
    for (const r of (data ?? []) as Array<{ amount_cents: number; currency: string; last_error: string | null }>) {
      const lane = /needs_attention:connect_lane:([a-z]+)/.exec(r.last_error ?? "")?.[1];
      if (!lane || !(r.amount_cents > 0)) continue;
      const currency = (r.currency || "mxn").toLowerCase();
      const key = `${lane}|${currency}`;
      const g = groups.get(key) ?? { lane, currency, amountCents: 0, count: 0 };
      g.amountCents += r.amount_cents;
      g.count += 1;
      groups.set(key, g);
    }
    return [...groups.values()];
  } catch (err) {
    logServerError("booking-payouts-ledger.getConnectLaneAttention", err);
    return [];
  }
}
