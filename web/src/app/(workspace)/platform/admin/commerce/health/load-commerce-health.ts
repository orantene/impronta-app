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
import { listHeldPayouts } from "@/lib/payments/booking-payouts-ledger";
import {
  computeCommerceHealth,
  snapshotKeyEnv,
  type CommerceHealthRow,
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

    // Lanes: US events keep the bare event id; MX is prefixed `platform_mx:`
    // (see laneScopedEventKey in stripe/event-idempotency.ts). Event ids from
    // Stripe never contain a colon, so "no colon" is the US lane.
    const [us, mx] = await Promise.all([
      sb
        .from("stripe_processed_events")
        .select("processed_at")
        .not("event_id", "like", "%:%")
        .order("processed_at", { ascending: false })
        .limit(1),
      sb
        .from("stripe_processed_events")
        .select("processed_at")
        .like("event_id", "platform_mx:%")
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

  // Reuse the Revenue tab's held-payouts query (it checks `error` itself).
  const held = (await listHeldPayouts(sb)).filter((p) => p.status === "held").length;

  const rows = computeCommerceHealth({
    ...snapshotKeyEnv(),
    heldPayoutCount: held,
    stuckPaymentRequestedCount: stuck,
    lastWebhookAt: { platform: platformLast, platform_mx: mxLast },
    now,
  });

  return { rows, failedReads, fetchedAt: now.toISOString() };
}
