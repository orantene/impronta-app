import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditFailure } from "@/lib/audit/emit";
import { logServerError } from "@/lib/server/safe-error";
import { openPurchaseThread, type OpenPurchaseThreadInput } from "@/lib/orders/purchase-thread";

/** Tag to grep in logs / Sentry / the activity log to backfill orphaned bookings. */
export const PURCHASE_THREAD_ORPHAN_TAG = "orders.createPurchase/thread-orphaned";

type Opener = (admin: SupabaseClient, input: OpenPurchaseThreadInput) => Promise<string | null>;

/**
 * Opens the purchase conversation with ONE retry (TUL-642).
 *
 * The thread is created AFTER the money leg, so a failure here must never
 * block or undo the paid purchase. But a booking with no conversation also has
 * no notifications (they hang off the inquiry), so on a final failure we leave
 * a durable, greppable trail: a Sentry-visible error tagged
 * {@link PURCHASE_THREAD_ORPHAN_TAG} plus a workspace activity-log row
 * (`system` category) carrying the order id, so ops can backfill it.
 *
 * Never throws and never touches charging or amounts.
 */
export async function openPurchaseThreadWithRetry(
  admin: SupabaseClient,
  input: OpenPurchaseThreadInput,
  open: Opener = openPurchaseThread,
): Promise<string | null> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const id = await open(admin, input);
      if (id) return id;
      lastError = new Error("openPurchaseThread returned no inquiry id");
    } catch (err) {
      lastError = err;
    }
  }
  logServerError(
    PURCHASE_THREAD_ORPHAN_TAG,
    lastError instanceof Error ? lastError : new Error(String(lastError)),
  );
  auditFailure(
    input.tenantId,
    "system",
    "orders.thread.failed",
    "A paid booking has no conversation and needs a backfill",
    {
      targetType: "order",
      targetId: input.orderId,
      reason: PURCHASE_THREAD_ORPHAN_TAG,
      metadata: { bookingId: input.bookingId ?? null, transactionId: input.transactionId ?? null },
    },
  );
  return null;
}
