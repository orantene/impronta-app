/**
 * Cron: cancel draft / pending_payment orders whose hold or idle fuse has lapsed.
 *
 * Endpoint: GET /api/cron/expire-orders  (CRON_SECRET bearer auth)
 *
 * Capacity's reaper already returns the seat. This moves the ORDER so it does
 * not sit in pending_payment forever.
 *
 * It also reaps lapsed COLLECTION RESERVATIONS, and that rides here rather than
 * on a route of its own because it is the same fuse on the same aggregate: a
 * claim on an order's balance that nobody completed is exactly as stranded as
 * the order it was taken against, and a second cron entry is a second thing to
 * forget to schedule. An unreaped reservation is money no till can collect.
 *
 * And it RECOVERS CARD COLLECTIONS WHOSE RESPONSE WAS LOST, for the same
 * reason and in a deliberate order: the recovery runs BEFORE the reaper is of
 * any use to it and AFTER the sweep, because a collection the provider confirms
 * succeeded must settle its own reservation through `markPaid` rather than have
 * the reaper free a balance that was in fact collected. Both fuses on one
 * schedule; neither can be forgotten separately.
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { sweepExpiredOrders } from "@/lib/orders/expire-orders";
import { reapCollectionReservations } from "@/lib/pos/collection-reservations";
import { recoverUnresolvedCollections } from "@/lib/pos/recover-collections";
import { reapPaymentLinks } from "@/lib/payments/links";
import { reapWaitlistOffers } from "@/lib/scheduling/waitlist-offers";
import { reapPartyWaitlist } from "@/lib/venues/party-waitlist";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/expire-orders", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "no_service_role" }, { status: 503 });

  try {
    const result = await sweepExpiredOrders(admin);
    // Ask the provider about lost card collections BEFORE the reaper runs. A
    // collection the provider confirms succeeded settles its own claim through
    // `markPaid`; letting the reaper free that balance first would hand a
    // second till money the customer has already paid.
    const recovered = await recoverUnresolvedCollections(admin);
    const reaped = await reapCollectionReservations(admin);
    const links = await reapPaymentLinks(admin);
    const offers = await reapWaitlistOffers(admin);
    const parties = await reapPartyWaitlist(admin);
    const reservationsReleased = reaped.ok ? reaped.released : 0;
    const paymentLinksExpired = links.ok ? links.expired : 0;
    const waitlistOffersReleased = offers.ok ? offers.released : 0;
    const partyWaitlistExpired = parties.ok ? parties.expired : 0;
    void improntaLog("orders.cron.expire_orders", {
      ...result,
      reservationsReleased,
      paymentLinksExpired,
      waitlistOffersReleased,
      partyWaitlistExpired,
      // FLAT, because the log's fields are scalars. A nested summary would
      // serialise as "[object Object]" and the four numbers that say whether a
      // customer was charged twice would be unreadable in the one place an
      // operator looks first.
      recoveryClaimed: recovered.claimed,
      recoverySettled: recovered.settled,
      recoveryReleased: recovered.released,
      recoveryInconclusive: recovered.inconclusive,
      recoveryStuck: recovered.stuck,
    });
    await recordCronHeartbeat({
      job: "expire-orders",
      ok: true,
      detail:
        `scanned=${result.scanned} cancelled=${result.cancelled} failed=${result.failed} `
        + `reservations_released=${reservationsReleased} `
        + `payment_links_expired=${paymentLinksExpired} `
        + `waitlist_offers_released=${waitlistOffersReleased} `
        + `party_waitlist_expired=${partyWaitlistExpired} `
        + `recovery_claimed=${recovered.claimed} recovery_settled=${recovered.settled} `
        + `recovery_released=${recovered.released} recovery_stuck=${recovered.stuck}`,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      reservationsReleased,
      paymentLinksExpired,
      waitlistOffersReleased,
      recovered,
    });
  } catch (err) {
    logServerError("cron/expire-orders", err);
    await recordCronHeartbeat({ job: "expire-orders", ok: false, detail: "sweep_failed" });
    return NextResponse.json({ ok: false, error: "sweep_failed" }, { status: 500 });
  }
}
