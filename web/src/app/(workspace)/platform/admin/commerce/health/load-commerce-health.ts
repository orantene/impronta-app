/**
 * load-commerce-health.ts (TUL-147) — server loader for the wiring panel.
 *
 * Read-only. Gated by the surrounding /platform/admin/layout.tsx (super_admin
 * via isPlatformAdmin, notFound otherwise), same as every sibling tab. Service
 * role is used because booking_payouts / booking_transactions /
 * stripe_processed_events are service-role tables, as in listHeldPayouts.
 * Every read checks `error`; a failed read is reported, never shown as zero.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { HELD_PAYOUTS_CAP, listHeldPayouts } from "@/lib/payments/booking-payouts-ledger";
import {
  LANE_FILTER_OR,
  computeCommerceHealth,
  snapshotKeyEnv,
  type CommerceHealthRow,
  type HeldPayoutsHealth,
} from "@/lib/payments/commerce-health";

export interface CommerceHealthResult {
  rows: CommerceHealthRow[];
  /** Check groups whose database read failed; those rows are not trusted. */
  failedReads: string[];
  fetchedAt: string;
}

export async function loadCommerceHealth(): Promise<CommerceHealthResult> {
  const now = new Date();
  const failedReads: string[] = [];
  const sb = createServiceRoleClient();

  let stuck = 0;
  let platformLast: string | null = null;
  let mxLast: string | null = null;

  if (!sb) {
    failedReads.push("db");
  } else {
    const cutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString();

    const stuckRes = await sb
      .from("booking_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "payment_requested")
      .lt("requested_at", cutoff);
    if (stuckRes.error) {
      logServerError("commerce-health.stuck", stuckRes.error);
      failedReads.push("stuck");
    } else {
      stuck = stuckRes.count ?? 0;
    }

    // Lanes: the explicit `lane` column (migration 20261231348000). Rows with a
    // NULL lane were written by old code during the deploy window (or predate
    // the column and were missed by the backfill); only those fall back to the
    // old event_id prefix rule. See LANE_FILTER_OR / classifyEventLane.
    const [us, mx] = await Promise.all([
      sb
        .from("stripe_processed_events")
        .select("processed_at")
        .or(LANE_FILTER_OR.platform)
        .order("processed_at", { ascending: false })
        .limit(1),
      sb
        .from("stripe_processed_events")
        .select("processed_at")
        .or(LANE_FILTER_OR.platform_mx)
        .order("processed_at", { ascending: false })
        .limit(1),
    ]);
    if (us.error) {
      logServerError("commerce-health.lane-us", us.error);
      failedReads.push("lane-us");
    } else {
      platformLast = (us.data?.[0]?.processed_at as string | undefined) ?? null;
    }
    if (mx.error) {
      logServerError("commerce-health.lane-mx", mx.error);
      failedReads.push("lane-mx");
    } else {
      mxLast = (mx.data?.[0]?.processed_at as string | undefined) ?? null;
    }
  }

  // Reuse the Revenue tab's held-payouts query. A failed read is an error row,
  // and a capped list reports a lower bound ("500+"), never a false exact count.
  const heldRes = await listHeldPayouts(sb);
  let heldPayouts: HeldPayoutsHealth;
  if (!heldRes.ok) {
    failedReads.push("held");
    heldPayouts = { state: "error" };
  } else {
    const count = heldRes.rows.filter((p) => p.status === "held").length;
    heldPayouts = heldRes.capped ? { state: "capped", count: HELD_PAYOUTS_CAP } : { state: "ok", count };
  }

  const rows = computeCommerceHealth({
    ...snapshotKeyEnv(),
    heldPayouts,
    stuckPaymentRequestedCount: stuck,
    lastWebhookAt: { platform: platformLast, platform_mx: mxLast },
    now,
  });

  return { rows, failedReads, fetchedAt: now.toISOString() };
}
