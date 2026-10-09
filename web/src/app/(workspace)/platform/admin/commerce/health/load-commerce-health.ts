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
  type MxLaneHealth,
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
  let mxLane: MxLaneHealth | undefined;

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

    // The MX lane in one row (TUL-186): last event with its livemode, events in 24h, and how many sellers are
    // connected on the MX platform. A failed read leaves `mxLane` unset (no row, a named failed read), never zeros.
    const [mxNewest, mx24, mxTalents, mxAgencies] = await Promise.all([
      sb.from("stripe_processed_events").select("processed_at, livemode").or(LANE_FILTER_OR.platform_mx).order("processed_at", { ascending: false }).limit(1),
      sb.from("stripe_processed_events").select("event_id", { count: "exact", head: true }).or(LANE_FILTER_OR.platform_mx).gte("processed_at", cutoff),
      sb.from("talent_profiles").select("id", { count: "exact", head: true }).eq("stripe_account_platform", "mx"),
      sb.from("agencies").select("id", { count: "exact", head: true }).eq("stripe_account_platform", "mx"),
    ]);
    const mxErr = mxNewest.error ?? mx24.error ?? mxTalents.error ?? mxAgencies.error;
    if (mxErr) {
      logServerError("commerce-health.mx-lane", mxErr);
      failedReads.push("mx-lane");
    } else {
      const newest = mxNewest.data?.[0] as { processed_at?: string; livemode?: boolean | null } | undefined;
      mxLane = {
        lastEventAt: newest?.processed_at ?? null,
        lastEventLivemode: newest?.livemode ?? null,
        eventsLast24h: mx24.count ?? 0,
        mxSellers: (mxTalents.count ?? 0) + (mxAgencies.count ?? 0),
      };
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
    mxLane,
    now,
  });

  return { rows, failedReads, fetchedAt: now.toISOString() };
}
